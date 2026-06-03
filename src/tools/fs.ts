import fs from "node:fs";
import path from "node:path";
import { artifactKindFromPath, type ArtifactKind } from "../protocol/actions.js";
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

export interface ToolReadFileResult {
  content: string;
  message: string;
  sizeBytes: number;
  chars: number;
  artifactKind: ArtifactKind;
  binary: boolean;
  truncated: boolean;
  fullTextAvailable: boolean;
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

export function appendFile(
  root: string,
  relativePath: string,
  content: string,
  create: boolean,
): string {
  const target = safeJoin(root, relativePath);
  if (!fs.existsSync(target)) {
    if (!create) throw new Error(`file does not exist: ${relativePath}; create it with write_file first`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }
  fs.appendFileSync(target, content, "utf8");
  return target;
}

export function readFile(root: string, relativePath: string): string {
  return fs.readFileSync(safeJoin(root, relativePath), "utf8");
}

export function readFileForTool(root: string, relativePath: string): ToolReadFileResult {
  const target = safeJoin(root, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) {
    throw new Error(`not a file: ${relativePath}`);
  }

  const artifactKind = artifactKindFromPath(relativePath);
  if (isBinaryArtifactKind(artifactKind)) {
    return binarySummary(relativePath, stat.size, artifactKind);
  }

  const probe = readProbe(target, stat.size);
  if (looksBinary(probe)) {
    return binarySummary(relativePath, stat.size, artifactKind);
  }

  const maxChars = readFileMaxChars();
  const text = fs.readFileSync(target, "utf8");
  if (text.length <= maxChars) {
    return {
      content: text,
      message: `${text.length} chars`,
      sizeBytes: stat.size,
      chars: text.length,
      artifactKind,
      binary: false,
      truncated: false,
      fullTextAvailable: true,
    };
  }

  const preview = text.slice(0, maxChars);
  const note = [
    "",
    `[read_file truncated: showing ${preview.length} of ${text.length} chars (${stat.size} bytes).`,
    "Use grep_files or run_command for targeted inspection instead of rereading the whole file.]",
  ].join("\n");
  return {
    content: `${preview}${note}`,
    message: `truncated text: showing ${preview.length} of ${text.length} chars (${stat.size} bytes)`,
    sizeBytes: stat.size,
    chars: text.length,
    artifactKind,
    binary: false,
    truncated: true,
    fullTextAvailable: false,
  };
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

function isBinaryArtifactKind(kind: ArtifactKind): boolean {
  return ["docx", "pptx", "pdf", "image", "screenshot"].includes(kind);
}

function binarySummary(relativePath: string, sizeBytes: number, artifactKind: ArtifactKind): ToolReadFileResult {
  const specificGuidance = artifactKind === "file"
    ? "Use run_command for a structured inspection if this binary file must be analyzed."
    : `Use validate_artifact expected_kind=${artifactKind} or run_command for structured inspection.`;
  const content = [
    `[binary file omitted: ${relativePath}]`,
    `kind=${artifactKind}`,
    `bytes=${sizeBytes}`,
    specificGuidance,
  ].join("\n");
  return {
    content,
    message: `binary artifact: ${artifactKind}, ${sizeBytes} bytes; ${specificGuidance}`,
    sizeBytes,
    chars: 0,
    artifactKind,
    binary: true,
    truncated: false,
    fullTextAvailable: false,
  };
}

function readProbe(target: string, sizeBytes: number): Buffer {
  const length = Math.min(sizeBytes, 8192);
  if (length <= 0) return Buffer.alloc(0);
  const fd = fs.openSync(target, "r");
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

function looksBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return true; // zip/docx/pptx/xlsx
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return true; // PDF
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return true; // PNG
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46])) return true; // RIFF/WebP/WAV

  let controlBytes = 0;
  for (const byte of buffer) {
    if (byte === 0) return true;
    const isAllowedWhitespace = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !isAllowedWhitespace) controlBytes += 1;
  }
  return controlBytes / buffer.length > 0.08;
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

function readFileMaxChars(): number {
  const parsed = Number.parseInt(process.env.DEEPSEEKCODE_READ_FILE_MAX_CHARS ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 1_000) return parsed;
  return 60_000;
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
