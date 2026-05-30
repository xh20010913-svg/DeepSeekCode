import fs from "node:fs";
import path from "node:path";
import type { CommandContext } from "../types/command.js";
import { safeJoin } from "../tools/pathSafety.js";
import { createUnifiedDiff, getGitDiff, truncateDiff } from "../utils/diff.js";

const MAX_REVIEW_FILE_BYTES = 1_000_000;
const MAX_REVIEW_DIFF_CHARS = 40_000;

export interface ReviewDiffInput {
  diff: string;
  source: string;
}

export function resolveReviewDiff(args: string, context: CommandContext): ReviewDiffInput | { error: string } {
  const trimmed = args.trim();
  if (trimmed.startsWith("file ")) {
    const [oldPath, newPath] = splitTwoArgs(trimmed.slice("file ".length));
    if (!oldPath || !newPath) return { error: "Usage: file <old-path> <new-path>" };
    try {
      const oldText = readReviewFile(context.config.projectPath, oldPath);
      const newText = readReviewFile(context.config.projectPath, newPath);
      return {
        diff: truncateDiff(createUnifiedDiff(`a/${oldPath}`, oldText, `b/${newPath}`, newText), MAX_REVIEW_DIFF_CHARS),
        source: `${oldPath} -> ${newPath}`,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const result = getGitDiff(context.config.projectPath, trimmed);
  if (!result.ok) return { error: `git diff unavailable: ${result.error}` };
  if (!result.diff.trim()) return { error: "No git diff changes to review." };
  return {
    diff: truncateDiff(result.diff, MAX_REVIEW_DIFF_CHARS),
    source: trimmed ? `git diff ${trimmed}` : "git diff",
  };
}

function readReviewFile(root: string, relativePath: string): string {
  const target = safeJoin(root, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error(`not a file: ${relativePath}`);
  if (stat.size > MAX_REVIEW_FILE_BYTES) throw new Error(`file is too large to review: ${relativePath}`);
  return fs.readFileSync(target, "utf8");
}

function splitTwoArgs(input: string): [string, string] {
  const matches = [...input.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
  return [normalize(matches[0] ?? ""), normalize(matches[1] ?? "")];
}

function normalize(value: string): string {
  return path.normalize(value).replaceAll("\\", "/");
}
