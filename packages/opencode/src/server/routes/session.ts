import { Hono } from "hono"
import { stream } from "hono/streaming"
import fs from "fs/promises"
import path from "path"
import { Instance } from "../../project/instance"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Session } from "../../session"
import { MessageV2 } from "../../session/message-v2"
import { SessionPrompt } from "../../session/prompt"
import { SessionCompaction } from "../../session/compaction"
import { SessionRevert } from "../../session/revert"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "../../session/todo"
import { Agent } from "../../agent/agent"
import { Snapshot } from "@/snapshot"
import { Log } from "../../util/log"
import { PermissionNext } from "@/permission/next"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { SessionPromptCache } from "../../session/prompt-cache"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"

import { TuiEvent } from "../../cli/cmd/tui/event"
import { Bus } from "../../bus"
import { Skill } from "../../skill"

const log = Log.create({ service: "server" })

export const SessionRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List sessions",
        description: "Get a list of all OpenCode sessions, sorted by most recently updated.",
        operationId: "session.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional().meta({ description: "Filter sessions by project directory" }),
          roots: z.coerce.boolean().optional().meta({ description: "Only return root sessions (no parentID)" }),
          start: z.coerce
            .number()
            .optional()
            .meta({ description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)" }),
          search: z.string().optional().meta({ description: "Filter sessions by title (case-insensitive)" }),
          limit: z.coerce.number().optional().meta({ description: "Maximum number of sessions to return" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const term = query.search?.toLowerCase()
        const sessions: Session.Info[] = []
        for await (const session of Session.list()) {
          if (query.directory !== undefined && session.directory !== query.directory) continue
          if (query.roots && session.parentID) continue
          if (query.start !== undefined && session.time.updated < query.start) continue
          if (term !== undefined && !session.title.toLowerCase().includes(term)) continue
          sessions.push(session)
          if (query.limit !== undefined && sessions.length >= query.limit) break
        }
        return c.json(sessions)
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get session status",
        description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
        operationId: "session.status",
        responses: {
          200: {
            description: "Get session status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), SessionStatus.Info)),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const result = SessionStatus.list()
        return c.json(result)
      },
    )
    .get("/engagement/config", async (c) => {
      const agent = await Agent.get("engagement")
      if (!agent || !agent.prompt) {
        return c.json({ error: "Engagement agent not found or missing prompt" }, 404)
      }
      return c.json({ prompt: agent.prompt })
    })
    .post(
      "/engagement/generate",
      describeRoute({
        summary: "Generate engagement details",
        description: "Generate structured engagement details (name, scope, etc.) using AI based on partial input.",
        operationId: "session.engagement.generate",
        responses: {
          200: {
            description: "Generated engagement details",
            content: {
              "application/json": {
                schema: resolver(z.object({
                  name: z.string().optional(),
                  scope: z.string().optional(),
                  targets: z.string().optional(),
                  exclusions: z.string().optional(),
                  roe: z.string().optional(),
                })),
              },
            },
          },
          ...errors(400, 500),
        },
      }),
      validator(
        "json",
        z.object({
          current: z.object({
            name: z.string().optional(),
            scope: z.string().optional(),
            targets: z.string().optional(),
            exclusions: z.string().optional(),
            roe: z.string().optional(),
          }),
          model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
          prompt: z.string().optional(),
        }),
      ),
      async (c) => {
        try {
          const { current, model, prompt: customPrompt } = c.req.valid("json")

          // 1. Resolve Model
          let targetModel: Provider.Model | undefined
          if (model) {
            try {
              targetModel = await Provider.getModel(model.providerID, model.modelID)
            } catch (err) {
              // Fallback if specific model fails
              targetModel = await Provider.getSmallModel(model.providerID).catch(() => undefined)
            }
          }

          if (!targetModel) {
            targetModel = await Provider.getSmallModel("opencode").catch(() => undefined)
          }

          if (!targetModel) {
            throw new Error("No available AI model found for generation.")
          }

          // 2. Construct Prompt
          const engagementAgent = await Agent.get("engagement")
          const defaultPrompt = engagementAgent?.prompt || ""
          let promptTemplate = customPrompt || defaultPrompt

          if (!promptTemplate) {
            throw new Error("Engagement prompt not found")
          }

          const prompt = promptTemplate
            .replace("{{name}}", current.name || "(Suggest a professional name)")
            .replace("{{scope}}", current.scope || "(Suggest standard scope)")
            .replace("{{targets}}", current.targets || "(Suggest standard targets)")
            .replace("{{exclusions}}", current.exclusions || "(Suggest standard exclusions)")
            .replace("{{roe}}", current.roe || "(Suggest standard rules)")
            + "\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown, no explanations."

          // 3. Call AI
          // Using a general agent or constructing a temporary one
          const agent = await Agent.get("summary")
          if (!agent) throw new Error("Agent 'summary' not found") // Should technically exist

          const userMsg: MessageV2.User = {
            id: "temp-gen-req",
            role: "user",
            agent: agent.name,
            model: { providerID: targetModel.providerID, modelID: targetModel.id },
            sessionID: "temp-engagement-gen",
            time: { created: Date.now() },
          }

          const result = await LLM.stream({
            agent,
            messages: [{ role: "user", content: prompt }],
            model: targetModel,
            sessionID: userMsg.sessionID,
            user: userMsg,
            system: [],
            abort: new AbortController().signal,
            tools: {}
          })

          // 4. Sanitize & Parse
          const text = await result.text
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          const cleanText = jsonMatch ? jsonMatch[0] : text.replace(/```json\n?|\n?```/g, "").trim()

          try {
            const json = JSON.parse(cleanText)
            return c.json(json)
          } catch (e) {
            log.error("Failed to parse AI response", { text, error: e })
            throw new Error("Failed to parse AI response")
          }
        } catch (e) {
          console.error("Engagement Generation Error:", e)
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
        }
      },
    )
    .get(
      "/:sessionID",
      describeRoute({
        summary: "Get session",
        description: "Retrieve detailed information about a specific OpenCode session.",
        tags: ["Session"],
        operationId: "session.get",
        responses: {
          200: {
            description: "Get session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.get.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("SEARCH", { url: c.req.url })
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/children",
      describeRoute({
        summary: "Get session children",
        tags: ["Session"],
        description: "Retrieve all child sessions that were forked from the specified parent session.",
        operationId: "session.children",
        responses: {
          200: {
            description: "List of children",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.children.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await Session.children(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/todo",
      describeRoute({
        summary: "Get session todos",
        description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
        operationId: "session.todo",
        responses: {
          200: {
            description: "Todo list",
            content: {
              "application/json": {
                schema: resolver(Todo.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const todos = await Todo.get(sessionID)
        return c.json(todos)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create session",
        description: "Create a new OpenCode session for interacting with AI assistants and managing conversations.",
        operationId: "session.create",
        responses: {
          ...errors(400),
          200: {
            description: "Successfully created session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator("json", Session.create.schema.optional()),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const session = await Session.create(body)
        return c.json(session)
      },
    )
    .delete(
      "/:sessionID",
      describeRoute({
        summary: "Delete session",
        description: "Delete a session and permanently remove all associated data, including messages and history.",
        operationId: "session.delete",
        responses: {
          200: {
            description: "Successfully deleted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.remove.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.remove(sessionID)
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID",
      describeRoute({
        summary: "Update session",
        description: "Update properties of an existing session, such as title or other metadata.",
        operationId: "session.update",
        responses: {
          200: {
            description: "Successfully updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
          time: z
            .object({
              archived: z.number().optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const updates = c.req.valid("json")

        const updatedSession = await Session.update(
          sessionID,
          (session) => {
            if (updates.title !== undefined) {
              session.title = updates.title
            }
            if (updates.time?.archived !== undefined) session.time.archived = updates.time.archived
          },
          { touch: false },
        )

        return c.json(updatedSession)
      },
    )
    .post(
      "/:sessionID/prompt",
      describeRoute({
        summary: "Set session prompt override",
        description: "Set a custom system prompt override for the current session.",
        operationId: "session.set_prompt",
        responses: {
          200: {
            description: "Successfully set prompt override",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          key: z.string(),
          content: z.string(),
        }),
      ),
      async (c) => {
        const { sessionID } = c.req.valid("param")
        const { key, content } = c.req.valid("json")
        // @ts-ignore
        SessionPromptCache.set(sessionID, key, content)
        await Session.update(
          sessionID,
          (draft) => {
            draft.promptOverride = { key, content }
          },
          { touch: false },
        )
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/engagement",
      describeRoute({
        summary: "Set engagement details",
        description: "Set the engagement details for the session.",
        operationId: "session.engagement",
        responses: {
          200: {
            description: "Successfully set engagement details",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          name: z.string().optional(),
          scope: z.string().optional(),
          targets: z.string().optional(),
          exclusions: z.string().optional(),
          roe: z.string().optional(),
          aiSettings: z
            .object({
              modelID: z.string().optional(),
              prompt: z.string().optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const { sessionID } = c.req.valid("param")
        const engagement = c.req.valid("json")
        await Session.update(
          sessionID,
          (draft) => {
            draft.engagement = engagement
          },
          { touch: true },
        )

        // Auto-scaffold pentest resources
        await scaffold(Instance.worktree)
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/init",
      describeRoute({
        summary: "Initialize session",
        description:
          "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
        operationId: "session.init",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", Session.initialize.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        await Session.initialize({ ...body, sessionID })
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/fork",
      describeRoute({
        summary: "Fork session",
        description: "Create a new session by forking an existing session at a specific message point.",
        operationId: "session.fork",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.fork.schema.shape.sessionID,
        }),
      ),
      validator("json", Session.fork.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const result = await Session.fork({ ...body, sessionID })
        return c.json(result)
      },
    )
    .post(
      "/:sessionID/abort",
      describeRoute({
        summary: "Abort session",
        description: "Abort an active session and stop any ongoing AI processing or command execution.",
        operationId: "session.abort",
        responses: {
          200: {
            description: "Aborted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        SessionPrompt.cancel(c.req.valid("param").sessionID)
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/share",
      describeRoute({
        summary: "Share session",
        description: "Create a shareable link for a session, allowing others to view the conversation.",
        operationId: "session.share",
        responses: {
          200: {
            description: "Successfully shared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.share(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/diff",
      describeRoute({
        summary: "Get message diff",
        description: "Get the file changes (diff) that resulted from a specific user message in the session.",
        operationId: "session.diff",
        responses: {
          200: {
            description: "Successfully retrieved diff",
            content: {
              "application/json": {
                schema: resolver(Snapshot.FileDiff.array()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionSummary.diff.schema.shape.sessionID,
        }),
      ),
      validator(
        "query",
        z.object({
          messageID: SessionSummary.diff.schema.shape.messageID,
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const params = c.req.valid("param")
        const result = await SessionSummary.diff({
          sessionID: params.sessionID,
          messageID: query.messageID,
        })
        return c.json(result)
      },
    )
    .delete(
      "/:sessionID/share",
      describeRoute({
        summary: "Unshare session",
        description: "Remove the shareable link for a session, making it private again.",
        operationId: "session.unshare",
        responses: {
          200: {
            description: "Successfully unshared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.unshare.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.unshare(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/summarize",
      describeRoute({
        summary: "Summarize session",
        description: "Generate a concise summary of the session using AI compaction to preserve key information.",
        operationId: "session.summarize",
        responses: {
          200: {
            description: "Summarized session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          providerID: z.string(),
          modelID: z.string(),
          auto: z.boolean().optional().default(false),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const session = await Session.get(sessionID)
        await SessionRevert.cleanup(session)
        const msgs = await Session.messages({ sessionID })
        let currentAgent = await Agent.defaultAgent()
        for (let i = msgs.length - 1; i >= 0; i--) {
          const info = msgs[i].info
          if (info.role === "user") {
            currentAgent = info.agent || (await Agent.defaultAgent())
            break
          }
        }
        await SessionCompaction.create({
          sessionID,
          agent: currentAgent,
          model: {
            providerID: body.providerID,
            modelID: body.modelID,
          },
          auto: body.auto,
        })
        await SessionPrompt.loop(sessionID)
        return c.json(true)
      },
    )
    .get(
      "/:sessionID/message",
      describeRoute({
        summary: "Get session messages",
        description: "Retrieve all messages in a session, including user prompts and AI responses.",
        operationId: "session.messages",
        responses: {
          200: {
            description: "List of messages",
            content: {
              "application/json": {
                schema: resolver(MessageV2.WithParts.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator(
        "query",
        z.object({
          limit: z.coerce.number().optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const messages = await Session.messages({
          sessionID: c.req.valid("param").sessionID,
          limit: query.limit,
        })
        return c.json(messages)
      },
    )
    .get(
      "/:sessionID/message/:messageID",
      describeRoute({
        summary: "Get message",
        description: "Retrieve a specific message from a session by its message ID.",
        operationId: "session.message",
        responses: {
          200: {
            description: "Message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Info,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const message = await MessageV2.get({
          sessionID: params.sessionID,
          messageID: params.messageID,
        })
        return c.json(message)
      },
    )
    .delete(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Delete a part from a message",
        operationId: "part.delete",
        responses: {
          200: {
            description: "Successfully deleted part",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await Session.removePart({
          sessionID: params.sessionID,
          messageID: params.messageID,
          partID: params.partID,
        })
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Update a part in a message",
        operationId: "part.update",
        responses: {
          200: {
            description: "Successfully updated part",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Part),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      validator("json", MessageV2.Part),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        if (body.id !== params.partID || body.messageID !== params.messageID || body.sessionID !== params.sessionID) {
          throw new Error(
            `Part mismatch: body.id='${body.id}' vs partID='${params.partID}', body.messageID='${body.messageID}' vs messageID='${params.messageID}', body.sessionID='${body.sessionID}' vs sessionID='${params.sessionID}'`,
          )
        }
        const part = await Session.updatePart(body)
        return c.json(part)
      },
    )
    .post(
      "/:sessionID/message",
      describeRoute({
        summary: "Send message",
        description: "Create and send a new message to a session, streaming the AI response.",
        operationId: "session.prompt",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        c.status(200)
        c.header("Content-Type", "application/json")
        return stream(c, async (stream) => {
          const sessionID = c.req.valid("param").sessionID
          const body = c.req.valid("json")
          const msg = await SessionPrompt.prompt({ ...body, sessionID })
          stream.write(JSON.stringify(msg))
        })
      },
    )
    .post(
      "/:sessionID/prompt_async",
      describeRoute({
        summary: "Send async message",
        description:
          "Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.",
        operationId: "session.prompt_async",
        responses: {
          204: {
            description: "Prompt accepted",
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        c.status(204)
        c.header("Content-Type", "application/json")
        return stream(c, async () => {
          const sessionID = c.req.valid("param").sessionID
          const body = c.req.valid("json")
          SessionPrompt.prompt({ ...body, sessionID })
        })
      },
    )
    .post(
      "/:sessionID/command",
      describeRoute({
        summary: "Send command",
        description: "Send a new command to a session for execution by the AI assistant.",
        operationId: "session.command",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.CommandInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.command({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/shell",
      describeRoute({
        summary: "Run shell command",
        description: "Execute a shell command within the session context and return the AI's response.",
        operationId: "session.shell",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Assistant),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.ShellInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.shell({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/revert",
      describeRoute({
        summary: "Revert message",
        description: "Revert a specific message in a session, undoing its effects and restoring the previous state.",
        operationId: "session.revert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator("json", SessionRevert.RevertInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("revert", c.req.valid("json"))
        const session = await SessionRevert.revert({
          sessionID,
          ...c.req.valid("json"),
        })
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/unrevert",
      describeRoute({
        summary: "Restore reverted messages",
        description: "Restore all previously reverted messages in a session.",
        operationId: "session.unrevert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await SessionRevert.unrevert({ sessionID })
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/permissions/:permissionID",
      describeRoute({
        summary: "Respond to permission",
        deprecated: true,
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "permission.respond",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
          permissionID: z.string(),
        }),
      ),
      validator("json", z.object({ response: PermissionNext.Reply })),
      async (c) => {
        const params = c.req.valid("param")
        PermissionNext.reply({
          requestID: params.permissionID,
          reply: c.req.valid("json").response,
        })
        return c.json(true)
      },
    ),
)

async function scaffold(worktree: string) {
  await Bus.publish(TuiEvent.ToastShow, {
    title: "Scaffolding",
    message: "Starting pentest agent scaffolding...",
    variant: "info",
  })

  // Recursive copy helper — mirrors full directory trees, skips existing files
  const copyRecursive = async (src: string, dest: string): Promise<{ copied: number; skipped: number }> => {
    let copied = 0
    let skipped = 0
    await fs.mkdir(dest, { recursive: true })
    const items = await fs.readdir(src)
    for (const item of items) {
      const srcItem = path.join(src, item)
      const destItem = path.join(dest, item)
      const stat = await fs.stat(srcItem)
      if (stat.isDirectory()) {
        const sub = await copyRecursive(srcItem, destItem)
        copied += sub.copied
        skipped += sub.skipped
      } else if (stat.isFile()) {
        if (await fs.stat(destItem).catch(() => false)) {
          skipped++
        } else {
          await fs.copyFile(srcItem, destItem)
          copied++
        }
      }
    }
    return { copied, skipped }
  }

  const copyFiles = async (sourceDir: string, targetDir: string, label: string) => {
    log.info(`scaffold ${label}`, { sourceDir, targetDir })
    try {
      if (!(await fs.stat(sourceDir).catch(() => false))) {
        log.warn(`scaffold source missing — ${label} skipped`, { sourceDir })
        await Bus.publish(TuiEvent.ToastShow, {
          message: `${label}: source not found at ${sourceDir}`,
          variant: "warning",
        })
        return
      }
      const { copied, skipped } = await copyRecursive(sourceDir, targetDir)
      await Bus.publish(TuiEvent.ToastShow, {
        message: `${label}: ${copied} scaffolded, ${skipped} skipped`,
        variant: "success",
      })
    } catch (error) {
      await Bus.publish(TuiEvent.ToastShow, { message: `Failed to scaffold ${label}`, variant: "error" })
      log.error(`Failed to scaffold ${label}`, { error, sourceDir, targetDir })
    }
  }

  // Agents — copy only top-level .md files, NOT subdirs (skills/, tools/ are handled separately below)
  const copyAgents = async (sourceDir: string, targetDir: string) => {
    log.info("scaffold Agents", { sourceDir, targetDir })
    try {
      if (!(await fs.stat(sourceDir).catch(() => false))) {
        log.warn("scaffold source missing — Agents skipped", { sourceDir })
        await Bus.publish(TuiEvent.ToastShow, { message: `Agents: source not found at ${sourceDir}`, variant: "warning" })
        return
      }
      await fs.mkdir(targetDir, { recursive: true })
      const items = await fs.readdir(sourceDir)
      let copied = 0
      let skipped = 0
      for (const item of items) {
        if (!item.endsWith(".md")) continue  // only agent definition files
        const src = path.join(sourceDir, item)
        const dest = path.join(targetDir, item)
        const stat = await fs.stat(src)
        if (!stat.isFile()) continue
        if (await fs.stat(dest).catch(() => false)) {
          skipped++
        } else {
          await fs.copyFile(src, dest)
          copied++
        }
      }
      await Bus.publish(TuiEvent.ToastShow, { message: `Agents: ${copied} scaffolded, ${skipped} skipped`, variant: "success" })
    } catch (error) {
      await Bus.publish(TuiEvent.ToastShow, { message: "Failed to scaffold Agents", variant: "error" })
      log.error("Failed to scaffold Agents", { error, sourceDir, targetDir })
    }
  }

  await copyAgents(
    path.resolve(import.meta.dir, "../../agent/pentest"),
    path.join(worktree, ".opencode", "agents"),
  )

  // Skills
  await copyFiles(
    path.resolve(import.meta.dir, "../../agent/pentest/skills"),
    path.join(worktree, ".opencode", "skills"),
    "Skills",
  )

  // Tools
  await copyFiles(
    path.resolve(import.meta.dir, "../../agent/pentest/tools"),
    path.join(worktree, ".opencode", "tools"),
    "Tools",
  )

  // Findings
  try {
    const sharedResourcesDir = path.join(worktree, ".opencode", "shared-resources")
    await fs.mkdir(sharedResourcesDir, { recursive: true })
    const findingsDest = path.join(sharedResourcesDir, "findings.json")
    if (await fs.stat(findingsDest).catch(() => false)) {
      await Bus.publish(TuiEvent.ToastShow, { message: "Findings: Skipped (exists)", variant: "warning" })
    } else {
      const findingsSrc = path.resolve(import.meta.dir, "../../agent/pentest/shared-resources/findings.json")
      await fs.copyFile(findingsSrc, findingsDest)
      await Bus.publish(TuiEvent.ToastShow, { message: "Findings: Scaffolded", variant: "success" })
    }
  } catch (error) {
    await Bus.publish(TuiEvent.ToastShow, { message: "Failed to scaffold Findings", variant: "error" })
    log.error("Failed to scaffold findings", { error })
  }

  // Available Models
  try {
    const sharedResourcesDir = path.join(worktree, ".opencode", "shared-resources")
    const availableModelsPath = path.join(sharedResourcesDir, "available-models.json")
    const providers = await Provider.list()
    const modelsList = []

    for (const provider of Object.values(providers)) {
      for (const model of Object.values(provider.models)) {
        let source: string = provider.source
        if (source === "custom") {
          if (provider.id === "ollama") source = "ollama-local"
          else if (provider.id === "vllm") source = "vllm-local"
        }

        modelsList.push({
          id: `${provider.id}/${model.id}`,
          name: model.name,
          provider: provider.id,
          source,
          baseURL: provider.options.baseURL,
          tools: model.capabilities.toolcall,
          best_for: "",
        })
      }
    }

    const content = JSON.stringify(
      {
        generated: new Date().toISOString(),
        instructions:
          "Copy a model value and paste into agent .md frontmatter as:  model: provider/model-id",
        models: modelsList,
      },
      null,
      2,
    )

    await fs.writeFile(availableModelsPath, content)
  } catch (err) {
    log.error("Failed to generate available-models.json", { error: err })
    await Bus.publish(TuiEvent.ToastShow, {
      message: "Failed to generate available-models.json",
      variant: "error",
    })
  }

  // opencode.json — MCP stub at engagement root
  try {
    const opencodeJsonPath = path.join(worktree, "opencode.json")
    if (await fs.stat(opencodeJsonPath).catch(() => false)) {
      await Bus.publish(TuiEvent.ToastShow, { message: "opencode.json: Skipped (exists)", variant: "warning" })
    } else {
      await fs.writeFile(opencodeJsonPath, JSON.stringify({ mcp: {} }, null, 2))
      await Bus.publish(TuiEvent.ToastShow, { message: "opencode.json: Scaffolded", variant: "success" })
    }
  } catch (error) {
    await Bus.publish(TuiEvent.ToastShow, { message: "Failed to scaffold opencode.json", variant: "error" })
    log.error("Failed to scaffold opencode.json", { error })
  }

  // Bust the skill cache so agents see the newly scaffolded skills immediately
  Skill.invalidate()
  log.info("scaffold complete — skill cache invalidated")
}
