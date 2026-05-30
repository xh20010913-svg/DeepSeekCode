import { spawnSync } from "node:child_process";

export interface DiffSummary {
  added: number;
  removed: number;
}

export interface GitDiffResult {
  ok: boolean;
  diff: string;
  error?: string;
}

export function createUnifiedDiff(
  oldName: string,
  oldText: string,
  newName: string,
  newText: string,
): string {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  if (oldLines.length * newLines.length > 4_000_000) {
    throw new Error("diff input is too large for in-process line diff");
  }
  const operations = lineOperations(oldLines, newLines);
  return [
    `--- ${oldName}`,
    `+++ ${newName}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...operations.map((operation) => `${operation.kind}${operation.line}`),
  ].join("\n");
}

export function summarizeDiff(diff: string): DiffSummary {
  let added = 0;
  let removed = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

export function getGitDiff(projectPath: string, target = ""): GitDiffResult {
  const args = ["-C", projectPath, "diff"];
  if (target.trim()) args.push("--", target.trim());
  const result = spawnSync("git", args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) {
    return { ok: false, diff: "", error: result.error.message };
  }
  if (result.status !== 0) {
    const error = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    return { ok: false, diff: "", error: error || `git diff exited ${result.status}` };
  }
  return { ok: true, diff: result.stdout };
}

export function getGitStatus(projectPath: string): GitDiffResult {
  const result = spawnSync("git", ["-C", projectPath, "status", "--short"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    return { ok: false, diff: "", error: result.error.message };
  }
  if (result.status !== 0) {
    const error = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    return { ok: false, diff: "", error: error || `git status exited ${result.status}` };
  }
  return { ok: true, diff: result.stdout };
}

export function getGitBranch(projectPath: string): GitDiffResult {
  const result = spawnSync("git", ["-C", projectPath, "branch", "--show-current"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    return { ok: false, diff: "", error: result.error.message };
  }
  if (result.status !== 0) {
    const error = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    return { ok: false, diff: "", error: error || `git branch exited ${result.status}` };
  }
  return { ok: true, diff: result.stdout.trim() };
}

export function truncateDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) return diff;
  const clipped = diff.slice(0, Math.max(0, maxChars));
  return `${clipped}\n... diff truncated at ${maxChars} chars ...`;
}

type DiffOperation = { kind: " " | "+" | "-"; line: string };

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized) return [];
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function lineOperations(oldLines: string[], newLines: string[]): DiffOperation[] {
  const table = buildLcsTable(oldLines, newLines);
  const operations: DiffOperation[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      operations.push({ kind: " ", line: oldLines[oldIndex] ?? "" });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (table[oldIndex + 1]![newIndex]! >= table[oldIndex]![newIndex + 1]!) {
      operations.push({ kind: "-", line: oldLines[oldIndex] ?? "" });
      oldIndex += 1;
    } else {
      operations.push({ kind: "+", line: newLines[newIndex] ?? "" });
      newIndex += 1;
    }
  }

  while (oldIndex < oldLines.length) {
    operations.push({ kind: "-", line: oldLines[oldIndex] ?? "" });
    oldIndex += 1;
  }
  while (newIndex < newLines.length) {
    operations.push({ kind: "+", line: newLines[newIndex] ?? "" });
    newIndex += 1;
  }

  return operations;
}

function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0),
  );
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex]![newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[oldIndex + 1]![newIndex + 1]! + 1
          : Math.max(table[oldIndex + 1]![newIndex]!, table[oldIndex]![newIndex + 1]!);
    }
  }
  return table;
}
