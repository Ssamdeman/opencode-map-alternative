import { $ } from "bun";
import { readdirSync } from "fs";

await Bun.write("test_dir/hello.md", "hello world");

await Bun.build({
  entrypoints: ["test_dir/hello.md"],
  compile: {
    outfile: "test-bin",
  }
});
