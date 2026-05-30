import type { Command } from "../../types/command.js";
import { buildReviewPrompt } from "../../services/review/reviewPrompt.js";
import { resolveReviewDiff } from "../reviewDiff.js";

export const reviewCommand: Command = {
  name: "review",
  description: "Create a DeepSeek review prompt for the current git diff or two files.",
  usage: "[git-path|file <old-path> <new-path>]",
  execute(args, context) {
    const resolved = resolveReviewDiff(args, context);
    if ("error" in resolved) return { message: resolved.error };
    return {
      message: `Review prompt prepared from ${resolved.source}`,
      submit: buildReviewPrompt({
        mode: "code",
        diff: resolved.diff,
        source: resolved.source,
      }),
    };
  },
};

export const securityReviewCommand: Command = {
  name: "security-review",
  description: "Create a high-confidence security review prompt for local changes.",
  usage: "[git-path|file <old-path> <new-path>]",
  execute(args, context) {
    const resolved = resolveReviewDiff(args, context);
    if ("error" in resolved) return { message: resolved.error };
    return {
      message: `Security review prompt prepared from ${resolved.source}`,
      submit: buildReviewPrompt({
        mode: "security",
        diff: resolved.diff,
        source: resolved.source,
      }),
    };
  },
};
