import { spawn, type ChildProcess } from "child_process"
import fs from "fs"

/**
 * ShellSession - Persistent shell session manager (Singleton)
 * Maintains environment variables and directory state across multiple commands.
 */
export class ShellSession {
    private static instance: ShellSession | null = null

    private process: ChildProcess
    private buffer: string = ""
    private readonly delimiter: string = "__MAP_END_SIG__"
    private readonly isWindows: boolean

    private constructor() {
        this.isWindows = process.platform === "win32"

        if (this.isWindows) {
            // Windows: PowerShell with stdin script mode
            // Using -File - reads script from stdin (better output handling than -Command -)
            this.process = spawn("powershell.exe", ["-NoProfile", "-NoLogo", "-File", "-"], {
                stdio: ["pipe", "pipe", "pipe"],
            })
        } else {
            // Unix: Prefer zsh, fallback to bash
            const shell = fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/bash"
            this.process = spawn(shell, ["-s"], {
                stdio: ["pipe", "pipe", "pipe"],
            })
        }

        // Accumulate stdout into buffer
        this.process.stdout?.on("data", (data: Buffer) => {
            this.buffer += data.toString()
        })

        // Also capture stderr into buffer
        this.process.stderr?.on("data", (data: Buffer) => {
            this.buffer += data.toString()
        })

        this.process.on("error", (err) => {
            console.error("[ShellSession] Process error:", err)
        })

        this.process.on("exit", (code) => {
            console.log("[ShellSession] Process exited with code:", code)
            ShellSession.instance = null
        })
    }

    /**
     * Get or create the singleton instance
     */
    public static getInstance(): ShellSession {
        if (!ShellSession.instance) {
            ShellSession.instance = new ShellSession()
        }
        return ShellSession.instance
    }

    /**
     * Execute a command in the persistent shell session
     * @param command - The command to execute
     * @returns Promise resolving to the command output (cleaned)
     */
    public execute(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // 1. Clear previous buffer
            this.buffer = ""

            // 2. Construct command with delimiter
            let fullCommand: string
            if (this.isWindows) {
                // PowerShell: use Base64 for delimiter to avoid literal in command echo
                const b64 = Buffer.from(this.delimiter).toString("base64")
                const decode = `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}"))`
                fullCommand = `${command}; Write-Output (${decode})\n`
            } else {
                // Unix: use echo for delimiter
                fullCommand = `${command}; echo "${this.delimiter}"\n`
            }

            // 3. Set up timeout for safety
            const timeout = setTimeout(() => {
                reject(new Error("[ShellSession] Command timed out"))
            }, 30000) // 30 second timeout

            // 4. Poll for delimiter in buffer
            const checkInterval = setInterval(() => {
                if (this.buffer.includes(this.delimiter)) {
                    clearTimeout(timeout)
                    clearInterval(checkInterval)

                    // 5. Clean output: remove delimiter and trim
                    let output = this.buffer
                        .split(this.delimiter)[0]
                        .trim()

                    // Windows: Remove echoed command line (contains Base64 code)
                    if (this.isWindows) {
                        const lines = output.split(/\r?\n/)
                        if (lines.length > 0 && lines[0].includes("FromBase64String")) {
                            output = lines.slice(1).join("\n").trim()
                        }
                    }

                    resolve(output)
                }
            }, 50) // Check every 50ms

            // 5. Write command to stdin
            if (!this.process.stdin) {
                clearTimeout(timeout)
                clearInterval(checkInterval)
                reject(new Error("[ShellSession] stdin not available"))
                return
            }

            this.process.stdin.write(fullCommand, (err) => {
                if (err) {
                    clearTimeout(timeout)
                    clearInterval(checkInterval)
                    reject(err)
                }
            })
        })
    }

    /**
     * Terminate the shell session
     */
    public terminate(): void {
        if (this.process) {
            this.process.kill()
            ShellSession.instance = null
        }
    }
}
