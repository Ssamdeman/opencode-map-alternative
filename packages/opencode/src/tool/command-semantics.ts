export interface PentestSemantics {
  isError: boolean
  message?: string
}

type Evaluator = (exitCode: number, hasOutput: boolean) => PentestSemantics | null

const HANDLERS: Record<string, Evaluator> = {
  // grep — exit 1 = no matches found (not error), exit 2 = actual error
  grep: (code) => (code === 1 ? { isError: false, message: "grep: no matches found" } : null),
  egrep: (code) => (code === 1 ? { isError: false, message: "egrep: no matches found" } : null),
  fgrep: (code) => (code === 1 ? { isError: false, message: "fgrep: no matches found" } : null),
  zgrep: (code) => (code === 1 ? { isError: false, message: "zgrep: no matches found" } : null),

  // nmap — exit 0 = success, non-zero with output = partial results (not error)
  nmap: (code, out) => (out ? { isError: false, message: "nmap: partial results or warnings encountered" } : null),

  // nc / netcat — exit 1 = connection closed (not error if stdout has data)
  nc: (code, out) => (code === 1 && out ? { isError: false, message: "netcat: connection closed but data was received" } : null),
  netcat: (code, out) => (code === 1 && out ? { isError: false, message: "netcat: connection closed but data was received" } : null),
  ncat: (code, out) => (code === 1 && out ? { isError: false, message: "ncat: connection closed but data was received" } : null),

  // gobuster — exit 1 with output = completed scan (not error)
  gobuster: (code, out) => (code === 1 && out ? { isError: false, message: "gobuster: scan completed" } : null),

  // nikto — exit 0-1 with output = normal
  nikto: (code, out) => (code === 1 && out ? { isError: false, message: "nikto: scan completed, findings or warnings present" } : null),

  // diff — exit 1 = differences found (not error)
  diff: (code) => (code === 1 ? { isError: false, message: "diff: differences found between files" } : null),

  // curl — exit codes vary, but if stdout has data, likely not error
  curl: (code, out) => (out ? { isError: false, message: "curl: data received despite non-zero exit" } : null),
  wget: (code, out) => (out ? { isError: false, message: "wget: data received despite non-zero exit" } : null),

  // ssh — exit 255 = connection error (real error)
  ssh: (code) => (code === 255 ? { isError: true, message: "ssh: connection error" } : null),

  // sqlmap — non-zero with output = normal completion
  sqlmap: (code, out) => (out ? { isError: false, message: "sqlmap: execution finished with output" } : null),
}

/**
 * Evaluates the exit code and stdout of a pentest command to determine if a non-zero exit code
 * is an expected behavior rather than a hard failure.
 */
export function interpretPentestResult(command: string, exitCode: number, stdout: string): PentestSemantics {
  if (exitCode === 0) return { isError: false }

  const tokens = command.trim().split(/\s+/)
  const baseTool = tokens[0]?.toLowerCase()

  if (!baseTool) return { isError: exitCode !== 0 }

  // Extract binary name irrespective of path (e.g., /usr/bin/nmap -> nmap)
  const toolName = baseTool.split(/[\/\\]/).pop() || baseTool

  const hasOutput = stdout.trim().replace(/\s/g, "").length > 0

  const handler = HANDLERS[toolName]
  if (handler) {
    const result = handler(exitCode, hasOutput)
    if (result) return result
  }

  // Fallback: If it's a generic command, focus on stdout context.
  // The global rule states: "if the tool produced meaningful output, treat it as success regardless of exit code"
  // But strictly scoped down to our lookup, the user says:
  // "The rule is simple: if the command produced stdout and the exit code is in the 'expected non-zero' list for that tool, it's not an error."
  // So, if there's no specific handler match that pardons it, it defaults to error.
  return { isError: exitCode !== 0 }
}
