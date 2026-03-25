import { Agent } from "./packages/opencode/src/agent/agent.ts";
import { PermissionNext } from "./packages/opencode/src/permission/next.ts";
import { Instance } from "./packages/opencode/src/project/instance.ts";

async function main() {
    await Instance.provide({
        directory: process.cwd(),
        fn: async () => {
            console.log("Loading agents...");
            const agents = await Agent.list();
            const recon = agents["recon"];
            
            if (!recon) {
                console.error("Recon agent not found!");
                process.exit(1);
            }

            console.log("\nRecon Agent loaded.");
            console.log("Permissions:");
            console.dir(recon.permission, { depth: null });

            const mcpToolName = "nmap_scan";
            const allowed = PermissionNext.check(recon.permission, mcpToolName);
            
            console.log(`\nIs MCP tool '${mcpToolName}' allowed?`, allowed);
            process.exit(0);
        }
    });
}

main().catch(console.error);
