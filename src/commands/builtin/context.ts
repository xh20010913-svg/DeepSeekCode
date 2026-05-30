import React from "react";
import type { Command } from "../../types/command.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import {
  ContextPanel,
  contextFilesPanelModel,
  contextMapPanelModel,
  contextPromptPanelModel,
} from "../../components/ContextPanel.js";

export const contextCommand: Command = {
  name: "context",
  description: "Inspect repository map and selected prompt context.",
  usage: "[map|files|prompt]",
  execute(args, context) {
    const mode = args.trim() || "map";
    const bundle = buildContextBundle(context.config.projectPath, 18_000);
    if (mode === "files") {
      return {
        message: bundle.selectedFiles
          .map((file) => `${file.path} chars=${file.content.length}${file.truncated ? " truncated" : ""}`)
          .join("\n") || "No selected files.",
        display: React.createElement(ContextPanel, { model: contextFilesPanelModel(bundle) }),
      };
    }
    if (mode === "prompt") {
      const prompt = contextBundlePrompt(bundle);
      return {
        message: prompt.slice(0, 8000),
        display: React.createElement(ContextPanel, { model: contextPromptPanelModel(bundle, prompt) }),
      };
    }
    return {
      message: [
        `files=${bundle.repositoryMap.files.length}`,
        `approxTokens=${bundle.approxTokens}`,
        ...bundle.repositoryMap.files.slice(0, 80).map((file) => `${file.path} (${file.size} bytes)`),
      ].join("\n"),
      display: React.createElement(ContextPanel, { model: contextMapPanelModel(bundle) }),
    };
  },
};
