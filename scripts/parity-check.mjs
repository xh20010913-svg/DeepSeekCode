import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const referenceRoot = join(process.cwd(), "vendor", "claudecode", "src");
const currentRoot = join(process.cwd(), "src");

function listDirectories(root) {
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort();
}

function fileCount(root, options = {}) {
  if (!existsSync(root)) return 0;
  let count = 0;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (options.excludeDirNames?.includes(entry)) continue;
      count += fileCount(full, options);
    }
    else count += 1;
  }
  return count;
}

function rootFiles(root) {
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isFile())
    .sort();
}

const refDirs = listDirectories(referenceRoot);
const curDirs = listDirectories(currentRoot).filter((name) => name !== "protocol");
const missingDirs = refDirs.filter((name) => !curDirs.includes(name));
const missingRootFiles = rootFiles(referenceRoot).filter((name) => !rootFiles(currentRoot).includes(name));

console.log("Claude Code parity check");
console.log(`missing directories: ${missingDirs.length ? missingDirs.join(", ") : "none"}`);
console.log(`missing root files: ${missingRootFiles.length ? missingRootFiles.join(", ") : "none"}`);
console.log("");
console.log("module,reference,ported,staged_upstream");
for (const dir of refDirs) {
  const ref = fileCount(join(referenceRoot, dir));
  const cur = fileCount(join(currentRoot, dir), { excludeDirNames: ["_upstream"] });
  const staged = fileCount(join(currentRoot, dir, "_upstream"));
  console.log(`${dir},${ref},${cur},${staged}`);
}
