import fs from "node:fs";
import path from "node:path";

export interface RepositoryMap {
  root: string;
  files: Array<{ path: string; size: number; ext: string }>;
  truncated: boolean;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".research",
  ".release",
  ".runtime-data",
  ".deepseekcode",
  "_upstream",
  "vendor",
  "coverage",
  ".next",
  ".cache",
  ".pytest_cache",
  ".turbo",
  "__pycache__",
  "npm-cache",
  "playwright-report",
  "results",
  "runtime-scenarios",
  "reports",
  "test-results",
  "tmp",
  "tmp-install-sources",
  "scenario-sources",
  "tencentdb-memory-inspect",
]);

export function buildRepositoryMap(root: string, limit = 300): RepositoryMap {
  const resolvedRoot = path.resolve(root);
  const files: RepositoryMap["files"] = [];
  let truncated = false;

  const walk = (dir: string) => {
    if (files.length >= limit) {
      truncated = true;
      return;
    }
    for (const name of fs.readdirSync(dir)) {
      if (shouldSkipDir(name)) continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        if (shouldSkipFile(name)) continue;
        files.push({
          path: path.relative(resolvedRoot, full).replaceAll("\\", "/"),
          size: stat.size,
          ext: path.extname(name).toLowerCase(),
        });
      }
      if (files.length >= limit) {
        truncated = true;
        return;
      }
    }
  };

  walk(resolvedRoot);
  return {
    root: resolvedRoot,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    truncated,
  };
}

function shouldSkipDir(name: string): boolean {
  if (SKIP_DIRS.has(name)) return true;
  const lower = name.toLowerCase();
  return (
    lower.startsWith(".deepseekcode-") ||
    lower.startsWith("prompt-audit") ||
    lower.startsWith("scenario-reports") ||
    lower.startsWith("scenario-report")
  );
}

function shouldSkipFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === ".env" ||
    lower.startsWith(".env.") ||
    lower.endsWith(".pem") ||
    lower.endsWith(".key") ||
    lower.endsWith(".p12") ||
    lower.endsWith(".sqlite") ||
    lower.endsWith(".sqlite-shm") ||
    lower.endsWith(".sqlite-wal") ||
    lower.endsWith(".db") ||
    lower.endsWith(".jsonl") ||
    lower.endsWith(".tgz")
  );
}

export function repositoryMapPrompt(map: RepositoryMap): string {
  const lines = map.files.map((file) => `${file.path} (${file.size} bytes)`);
  if (map.truncated) lines.push("...truncated...");
  return lines.length > 0 ? lines.join("\n") : "(empty project)";
}
