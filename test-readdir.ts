import fs from "fs";
import { Glob } from "bun";

const files = Array.from(new Glob("**/*").scanSync({ cwd: "src/agent/pentest" })).map(f => `src/agent/pentest/${f}`);

await Bun.write("test_dir/main.ts", `
import fs from 'fs';
console.log(fs.readdirSync(import.meta.dir + "/../src/agent/pentest"));
`);

await Bun.build({
  entrypoints: ["test_dir/main.ts", ...files],
  compile: {
    outfile: "test-bin",
    target: "bun"
  }
});
