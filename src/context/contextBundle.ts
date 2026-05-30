import fs from "node:fs";
import path from "node:path";
import { buildRepositoryMap, type RepositoryMap } from "./repositoryMap.js";
import { WorkspaceDirectoryService } from "../services/workspace/workspaceDirectoryService.js";

export interface ContextBundle {
  repositoryMap: RepositoryMap;
  selectedFiles: Array<{
    path: string;
    content: string;
    truncated: boolean;
    score: number;
  }>;
  approxTokens: number;
}

const INTERESTING_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".toml",
  ".yml",
  ".yaml",
]);

const SECRET_LINE = /(api[_-]?key|token|secret|password|authorization|bearer)\b\s*[:=]\s*.+/i;
const MAX_FILE_EXCERPT_CHARS = 6_000;

export function buildContextBundle(projectRoot: string, budgetChars = 16_000, goal = ""): ContextBundle {
  const repositoryMap = buildMergedRepositoryMap(projectRoot);
  const selectedFiles = [];
  let used = 0;
  const ranked = workspaceFiles(projectRoot, repositoryMap)
    .filter((file) => INTERESTING_EXTS.has(file.ext))
    .map((file) => ({ file, score: scoreFile(file.displayPath, file.ext, goal) }))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  for (const { file, score } of ranked) {
    if (!INTERESTING_EXTS.has(file.ext)) continue;
    if (used >= budgetChars) break;
    const fullPath = file.fullPath;
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size > 80_000) continue;
    const raw = redactSecrets(fs.readFileSync(fullPath, "utf8"));
    const remaining = Math.min(budgetChars - used, MAX_FILE_EXCERPT_CHARS);
    const content = raw.slice(0, remaining);
    selectedFiles.push({
      path: file.displayPath,
      content,
      truncated: raw.length > content.length,
      score,
    });
    used += content.length;
  }
  return {
    repositoryMap,
    selectedFiles,
    approxTokens: Math.ceil(used / 4),
  };
}

export function contextBundlePrompt(bundle: ContextBundle): string {
  const files = bundle.selectedFiles.map((file) => {
    const suffix = file.truncated ? "\n...truncated..." : "";
    return `<file path="${file.path}">\n${file.content}${suffix}\n</file>`;
  });
  return files.length > 0 ? files.join("\n\n") : "(no selected file excerpts)";
}

export function redactSecrets(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => (SECRET_LINE.test(line) ? line.replace(/[:=]\s*.+$/, "= [redacted]") : line))
    .join("\n");
}

function scoreFile(filePath: string, ext: string, goal: string): number {
  const lower = filePath.toLowerCase();
  let score = 0;
  if (lower === "package.json") score += 80;
  if (lower === "readme.md" || lower.endsWith("/readme.md")) score += 70;
  if (lower.includes("src/")) score += 30;
  if (lower.includes("test") || lower.endsWith(".test.ts") || lower.endsWith(".test.tsx")) score += 20;
  if ([".ts", ".tsx"].includes(ext)) score += 25;
  if ([".md", ".json"].includes(ext)) score += 10;
  for (const token of goalTokens(goal)) {
    if (lower.includes(token)) score += 18;
  }
  return score;
}

function goalTokens(goal: string): string[] {
  return Array.from(new Set(
    goal
      .toLowerCase()
      .split(/[^a-z0-9_\-\u4e00-\u9fa5]+/u)
      .filter((token) => token.length >= 2)
      .slice(0, 20),
  ));
}

function buildMergedRepositoryMap(projectRoot: string): RepositoryMap {
  const primary = buildRepositoryMap(projectRoot, 500);
  const service = new WorkspaceDirectoryService(projectRoot);
  const extraFiles = [];
  for (const workspace of service.list()) {
    if (!fs.existsSync(workspace.path)) continue;
    const map = buildRepositoryMap(workspace.path, 150);
    for (const file of map.files) {
      extraFiles.push({
        path: `@${workspace.name}/${file.path}`,
        size: file.size,
        ext: file.ext,
      });
    }
  }
  return {
    root: primary.root,
    files: [...primary.files, ...extraFiles].sort((a, b) => a.path.localeCompare(b.path)),
    truncated: primary.truncated,
  };
}

function workspaceFiles(
  projectRoot: string,
  map: RepositoryMap,
): Array<{ path: string; displayPath: string; fullPath: string; ext: string; size: number }> {
  const workspaces = new WorkspaceDirectoryService(projectRoot).list();
  return map.files.map((file) => {
    const workspaceMatch = file.path.match(/^@([^/]+)\/(.+)$/);
    if (workspaceMatch) {
      const workspace = workspaces.find((entry) => entry.name === workspaceMatch[1]);
      return {
        path: file.path,
        displayPath: file.path,
        fullPath: workspace ? path.join(workspace.path, workspaceMatch[2]) : path.join(projectRoot, file.path),
        ext: file.ext,
        size: file.size,
      };
    }
    return {
      path: file.path,
      displayPath: file.path,
      fullPath: path.join(projectRoot, file.path),
      ext: file.ext,
      size: file.size,
    };
  });
}
