import fs from "node:fs";
import path from "node:path";
import { safeJoin, safeOptionalJoin } from "./pathSafety.js";

export interface FileEntry {
  path: string;
  kind: "file" | "dir";
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export function writeFile(
  root: string,
  relativePath: string,
  content: string,
  overwrite: boolean,
): string {
  const target = safeJoin(root, relativePath);
  if (fs.existsSync(target) && !overwrite) {
    throw new Error(`file already exists: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return target;
}

export function readFile(root: string, relativePath: string): string {
  return fs.readFileSync(safeJoin(root, relativePath), "utf8");
}

export function listFiles(root: string, relativePath: string, maxDepth: number): FileEntry[] {
  const base = safeOptionalJoin(root, relativePath);
  const rootResolved = path.resolve(root);
  const entries: FileEntry[] = [];
  walk(base, Math.max(1, maxDepth), 0, (entryPath, kind) => {
    if (entryPath === base) return;
    entries.push({
      path: path.relative(rootResolved, entryPath).replaceAll("\\", "/"),
      kind,
    });
  });
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function globFiles(
  root: string,
  relativePath: string,
  pattern: string,
  maxResults: number,
): string[] {
  const entries = listFiles(root, relativePath, 20).filter((entry) => entry.kind === "file");
  const matcher = wildcardToRegExp(pattern);
  return entries
    .map((entry) => entry.path)
    .filter((entryPath) => matcher.test(entryPath))
    .slice(0, maxResults);
}

export function grepFiles(
  root: string,
  relativePath: string,
  pattern: string,
  include: string | undefined,
  maxResults: number,
): GrepMatch[] {
  const base = safeOptionalJoin(root, relativePath);
  const rootResolved = path.resolve(root);
  const includeMatcher = include ? wildcardToRegExp(include) : null;
  const patternMatcher = new RegExp(pattern, "i");
  const matches: GrepMatch[] = [];
  walk(base, 20, 0, (entryPath, kind) => {
    if (kind !== "file" || matches.length >= maxResults) return;
    const rel = path.relative(rootResolved, entryPath).replaceAll("\\", "/");
    if (includeMatcher && !includeMatcher.test(rel)) return;
    if (fs.statSync(entryPath).size > 512_000) return;
    const text = fs.readFileSync(entryPath, "utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
      if (patternMatcher.test(lines[index] ?? "")) {
        matches.push({ path: rel, line: index + 1, text: lines[index] ?? "" });
      }
    }
  });
  return matches;
}

export function applyTextPatch(
  root: string,
  relativePath: string,
  edits: Array<{ search: string; replace: string }>,
): string {
  const target = safeJoin(root, relativePath);
  let content = fs.readFileSync(target, "utf8");
  for (const edit of edits) {
    const count = countOccurrences(content, edit.search);
    if (count === 0) throw new Error("patch search text not found");
    if (count > 1) throw new Error("patch search text is ambiguous");
    content = content.replace(edit.search, edit.replace);
  }
  fs.writeFileSync(target, content, "utf8");
  return target;
}

function walk(
  current: string,
  maxDepth: number,
  depth: number,
  visit: (entryPath: string, kind: "file" | "dir") => void,
): void {
  const stat = fs.statSync(current);
  const kind = stat.isDirectory() ? "dir" : "file";
  visit(current, kind);
  if (!stat.isDirectory() || depth >= maxDepth) return;
  for (const child of fs.readdirSync(current)) {
    if (shouldSkip(child)) continue;
    walk(path.join(current, child), maxDepth, depth + 1, visit);
  }
}

function shouldSkip(name: string): boolean {
  return [
    ".git",
    "node_modules",
    "dist",
    "target",
    ".research",
    ".release",
    ".runtime-data",
  ].includes(name);
}

function countOccurrences(text: string, search: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(search, index);
    if (found === -1) return count;
    count += 1;
    index = found + search.length;
  }
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "__DOUBLE_STAR__")
    .replaceAll("*", "[^/]*")
    .replaceAll("__DOUBLE_STAR__", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i");
}
