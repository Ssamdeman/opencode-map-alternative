import fs from 'fs';
import path from 'path';

await Bun.write("test_dir/hello.md", "hello world testing embed");
await Bun.write("src/test-main.ts", `
import fs from 'fs';
import path from 'path';
// We will try to read the file from the bunfs
try {
  const c = fs.readFileSync(path.join(import.meta.dir, "../../test_dir/hello.md"), 'utf8');
  console.log("SUCCESS:", c);
} catch (e) {
  console.error("FAIL:", e);
}
`);

await Bun.build({
  entrypoints: ["src/test-main.ts", "test_dir/hello.md"],
  compile: {
    outfile: "test-dist/bin",
    target: "bun-linux-x64-baseline"
  }
});
