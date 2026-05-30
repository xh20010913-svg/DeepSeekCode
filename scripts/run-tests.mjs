import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(process.cwd(), "dist");
const tests = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (entry.endsWith(".test.js")) {
      tests.push(full);
    }
  }
}

walk(root);

if (tests.length === 0) {
  console.error("No compiled tests found under dist");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
  cwd: process.cwd(),
});

process.exit(result.status ?? 1);
