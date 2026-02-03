import { ShellSession } from "../packages/opencode/src/shell/shell-session"

async function testCdPersistence() {
    console.log("[Test] Initializing ShellSession...")
    const session = ShellSession.getInstance()

    // Get initial working directory
    console.log("[Test] Getting initial pwd...")
    const initial = await session.execute("pwd")
    console.log(`[Test] Initial pwd: ${initial}`)

    // Change to a different directory
    console.log("[Test] Changing directory to C:\\Users...")
    await session.execute("Set-Location 'C:\\Users'")

    // Get new working directory
    console.log("[Test] Getting new pwd...")
    const after = await session.execute("pwd")
    console.log(`[Test] After cd pwd: ${after}`)

    // Verify
    if (after.includes("C:\\Users") || after.includes("/c/Users")) {
        console.log("✓ Directory change persisted correctly!")
    } else {
        console.log("✗ Directory change did NOT persist!")
    }

    // Clean up
    session.terminate()
}

testCdPersistence().catch(console.error)
