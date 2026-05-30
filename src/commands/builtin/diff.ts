import fs from "node:fs";
import path from "node:path";
import React from "react";
import { DiffReviewPanel } from "../../components/DiffReviewPanel.js";
import type { Command } from "../../types/command.js";
import { safeJoin } from "../../tools/pathSafety.js";
import {
  createUnifiedDiff,
  getGitDiff,
  getGitStatus,
  summarizeDiff,
  truncateDiff,
} from "../../utils/diff.js";

const MAX_FILE_BYTES = 1_000_000;
const MAX_DIFF_CHARS = 18_000;

export const diffCommand: Command = {
  name: "diff",
  description: "Show git or file-to-file diffs inside the project.",
  usage: "[git [path]|file <old-path> <new-path>|status]",
  execute(args, context) {
    const trimmed = args.trim();
    if (!trimmed || trimmed === "git" || trimmed.startsWith("git ")) {
      const target = trimmed.startsWith("git ") ? trimmed.slice("git ".length).trim() : "";
      const result = getGitDiff(context.config.projectPath, target);
      if (!result.ok) return { message: `git diff unavailable: ${result.error}` };
      if (!result.diff.trim()) return { message: "No git diff changes." };
      const summary = summarizeDiff(result.diff);
      return {
        message: [
          `git diff ${target || "(workspace)"} +${summary.added} -${summary.removed}`,
          truncateDiff(result.diff, MAX_DIFF_CHARS),
        ].join("\n"),
        display: React.createElement(DiffReviewPanel, {
          diff: truncateDiff(result.diff, MAX_DIFF_CHARS),
          title: `Git diff ${target || "workspace"}`,
          subtitle: context.config.projectPath,
          sourceLabel: "git diff HEAD",
          maxLines: 180,
        }),
      };
    }

    if (trimmed === "status") {
      const result = getGitStatus(context.config.projectPath);
      if (!result.ok) return { message: `git status unavailable: ${result.error}` };
      return { message: result.diff.trim() || "No git status changes." };
    }

    if (trimmed.startsWith("file ")) {
      const [oldPath, newPath] = splitTwoArgs(trimmed.slice("file ".length));
      if (!oldPath || !newPath) return { message: "Usage: /diff file <old-path> <new-path>" };
      try {
        const oldText = readDiffFile(context.config.projectPath, oldPath);
        const newText = readDiffFile(context.config.projectPath, newPath);
        const diff = createUnifiedDiff(`a/${oldPath}`, oldText, `b/${newPath}`, newText);
        const summary = summarizeDiff(diff);
        return {
          message: [
            `file diff ${oldPath} -> ${newPath} +${summary.added} -${summary.removed}`,
            truncateDiff(diff, MAX_DIFF_CHARS),
          ].join("\n"),
          display: React.createElement(DiffReviewPanel, {
            diff: truncateDiff(diff, MAX_DIFF_CHARS),
            title: `File diff ${newPath}`,
            subtitle: `${oldPath} -> ${newPath}`,
            sourceLabel: "file compare",
            maxLines: 180,
          }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }

    return { message: "Usage: /diff [git [path]|file <old-path> <new-path>|status]" };
  },
};

function readDiffFile(root: string, relativePath: string): string {
  const target = safeJoin(root, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error(`not a file: ${relativePath}`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`file is too large to diff: ${relativePath}`);
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
