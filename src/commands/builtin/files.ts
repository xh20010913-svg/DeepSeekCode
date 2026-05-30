import React from "react";
import type { Command } from "../../types/command.js";
import { buildContextBundle } from "../../context/contextBundle.js";
import { ContextPanel, contextFilesPanelModel } from "../../components/ContextPanel.js";

export const filesCommand: Command = {
  name: "files",
  description: "Show files DeepSeekCode would include in the current prompt context.",
  usage: "[goal]",
  execute(args, context) {
    const goal = args.trim();
    const bundle = buildContextBundle(context.config.projectPath, 18_000, goal);
    if (bundle.selectedFiles.length === 0) {
      return {
        message: "No files selected for context.",
        display: React.createElement(ContextPanel, { model: contextFilesPanelModel(bundle, goal) }),
      };
    }
    return {
      message: [
        `selected=${bundle.selectedFiles.length} approxTokens=${bundle.approxTokens}`,
        ...bundle.selectedFiles.map((file) =>
          `${file.path} score=${file.score} chars=${file.content.length}${file.truncated ? " truncated" : ""}`,
        ),
      ].join("\n"),
      display: React.createElement(ContextPanel, { model: contextFilesPanelModel(bundle, goal) }),
    };
  },
};
