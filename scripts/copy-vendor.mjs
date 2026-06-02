import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "src", "vendor");
const target = path.join(root, "dist", "vendor");

if (fs.existsSync(source)) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}
