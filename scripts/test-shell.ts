/**
 * Test script for ShellSession - validates persistent shell state
 * Run with: bun run scripts/test-shell.ts
 */

import { ShellSession } from "../packages/opencode/src/shell/shell-session"

async function main() {
    console.log("[Test] Initializing ShellSession...")
    const session = ShellSession.getInstance()

    const isWindows = process.platform === "win32"

    try {
        // Step 1: Set a variable
        console.log("[Test] Setting variable a=100...")
        if (isWindows) {
            await session.execute("$a = 100")
        } else {
            await session.execute("a=100")
        }

        // Step 2: Echo the variable
        console.log("[Test] Reading variable...")
        let output: string
        if (isWindows) {
            output = await session.execute("Write-Output $a")
        } else {
            output = await session.execute("echo $a")
        }

        // Step 3: Assert the output
        const trimmedOutput = output.trim()
        console.log(`[Test] Output received: "${trimmedOutput}"`)

        if (trimmedOutput === "100") {
            console.log("✓ Variable persistence test passed: output = 100")
            session.terminate()
            process.exit(0)
        } else {
            console.error(`✗ Variable persistence test FAILED: expected "100", got "${trimmedOutput}"`)
            session.terminate()
            process.exit(1)
        }
    } catch (error) {
        console.error("[Test] Error:", error)
        session.terminate()
        process.exit(1)
    }
}

main()
