
import fs from 'fs';
import path from 'path';
// We will try to read the file from the bunfs
try {
  const c = fs.readFileSync(path.join(import.meta.dir, "../../test_dir/hello.md"), 'utf8');
  console.log("SUCCESS:", c);
} catch (e) {
  console.error("FAIL:", e);
}
