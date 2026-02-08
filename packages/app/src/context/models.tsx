import { createMemo, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { DateTime } from "luxon"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { useProviders } from "@/hooks/use-providers"
import { usePlatform } from "@/context/platform"
import { showToast } from "@opencode-ai/ui/toast"
import { Persist, persisted } from "@/utils/persist"
import { detectOllama, fetchOllamaModels, type LocalModelInfo } from "@/lib/ollama-discovery"

export type ModelKey = { providerID: string; modelID: string }

type Visibility = "show" | "hide"
type User = ModelKey & { visibility: Visibility; favorite?: boolean }
type Store = {
  user: User[]
  recent: ModelKey[]
  variant?: Record<string, string | undefined>
}

export const { use: useModels, provider: ModelsProvider } = createSimpleContext({
  name: "Models",
  init: () => {
    const providers = useProviders()
    const platform = usePlatform()
    const [ollamaModels, setOllamaModels] = createSignal<LocalModelInfo[]>([
      {
        id: "debug-model",
        name: "DEBUG MODEL (Ollama)",
        family: "ollama",
        release_date: new Date().toISOString(),
        attachment: false,
        reasoning: false,
        temperature: true,
        tool_call: false,
        limit: { context: 1024, output: 1024 }
      }
    ])

    onMount(async () => {
      // Re-enable detection
      const detected = await detectOllama()
      if (detected) {
        console.log("Ollama detected")
        const models = await fetchOllamaModels()
        console.log("Fetched Ollama models:", models)
        if (models.length > 0) {
          setOllamaModels(models)
          showToast({ title: "Ollama Connected", description: `Found ${models.length} local models` })
        } else {
          showToast({ title: "Ollama Connected", description: "No models found in Ollama" })
        }
      } else {
        console.warn("Ollama detection failed")
        showToast({ title: "Ollama Detection Failed", description: "Could not connect to http://localhost:11434" })
      }
    })

    const [store, setStore, _, ready] = persisted(
      Persist.global("model", ["model.v1"]),
      createStore<Store>({
        user: [],
        recent: [],
        variant: {},
      }),
    )

    const available = createMemo(() =>
      providers.connected().flatMap((p) =>
        Object.values(p.models).map((m) => ({
          ...m,
          provider: p,
        })),
      ).concat(
        ollamaModels().map((m) => ({
          ...m,
          // Adapt LocalModelInfo to match expected structure
          provider: { id: "ollama", name: "Ollama", env: [] as string[] } as any,
          options: {},
        }))
      ),
    )

    const latest = createMemo(() =>
      pipe(
        available(),
        filter((x) => Math.abs(DateTime.fromISO(x.release_date).diffNow().as("months")) < 6),
        groupBy((x) => x.provider.id),
        mapValues((models) =>
          pipe(
            models,
            groupBy((x) => x.family),
            values(),
            (groups) =>
              groups.flatMap((g) => {
                const first = firstBy(g, [(x) => x.release_date, "desc"])
                return first ? [{ modelID: first.id, providerID: first.provider.id }] : []
              }),
          ),
        ),
        values(),
        flat(),
      ),
    )

    const latestSet = createMemo(() => new Set(latest().map((x) => `${x.providerID}:${x.modelID}`)))

    const visibility = createMemo(() => {
      const map = new Map<string, Visibility>()
      for (const item of store.user) map.set(`${item.providerID}:${item.modelID}`, item.visibility)
      return map
    })

    const list = createMemo(() =>
      available().map((m) => ({
        ...m,
        name: m.name.replace("(latest)", "").trim(),
        latest: m.name.includes("(latest)"),
      })),
    )

    const find = (key: ModelKey) => list().find((m) => m.id === key.modelID && m.provider.id === key.providerID)

    function update(model: ModelKey, state: Visibility) {
      const index = store.user.findIndex((x) => x.modelID === model.modelID && x.providerID === model.providerID)
      if (index >= 0) {
        setStore("user", index, { visibility: state })
        return
      }
      setStore("user", store.user.length, { ...model, visibility: state })
    }

    const visible = (model: ModelKey) => {
      const key = `${model.providerID}:${model.modelID}`
      const state = visibility().get(key)
      if (state === "hide") return false
      if (state === "show") return true
      if (latestSet().has(key)) return true
      const m = find(model)
      if (!m?.release_date || !DateTime.fromISO(m.release_date).isValid) return true
      return false
    }

    const setVisibility = (model: ModelKey, state: boolean) => {
      update(model, state ? "show" : "hide")
    }

    const push = (model: ModelKey) => {
      const uniq = uniqueBy([model, ...store.recent], (x) => x.providerID + x.modelID)
      if (uniq.length > 5) uniq.pop()
      setStore("recent", uniq)
    }

    const variantKey = (model: ModelKey) => `${model.providerID}/${model.modelID}`
    const getVariant = (model: ModelKey) => store.variant?.[variantKey(model)]

    const setVariant = (model: ModelKey, value: string | undefined) => {
      const key = variantKey(model)
      if (!store.variant) {
        setStore("variant", { [key]: value })
        return
      }
      setStore("variant", key, value)
    }

    return {
      ready,
      list,
      find,
      visible,
      setVisibility,
      recent: {
        list: createMemo(() => store.recent),
        push,
      },
      variant: {
        get: getVariant,
        set: setVariant,
      },
    }
  },
})
