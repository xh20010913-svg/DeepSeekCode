import React from "react";
import { ProjectPanel, modelPanelModel } from "../../components/ProjectPanel.js";
import { resolveDeepSeekModelSelection } from "../../services/deepseek/models.js";
import type { Command } from "../../types/command.js";

export const modelCommand: Command = {
  name: "model",
  aliases: ["models"],
  description: "Show, switch, or verify the active DeepSeek model.",
  usage: "[flash|pro|verify]",
  async execute(args, context) {
    const trimmed = args.trim();
    if (trimmed === "verify") {
      if (!context.provider) {
        return {
          message: "DEEPSEEK_API_KEY is not configured, so the model cannot be verified.",
          display: React.createElement(ProjectPanel, {
            model: modelPanelModel({
              model: context.config.model,
              providerName: context.config.provider?.name,
              providerReady: Boolean(context.provider),
            }),
          }),
        };
      }
      const reply = await context.provider.verifyModel();
      return {
        message: `Model verified: ${reply.model}\nReply: ${reply.text.trim() || "(empty)"}`,
        display: React.createElement(ProjectPanel, {
          model: modelPanelModel({
            model: context.config.model,
            providerName: reply.provider,
            providerReady: true,
            verifiedModel: reply.model,
            verifiedText: reply.text.trim() || "(empty)",
          }),
        }),
      };
    }
    if (trimmed) {
      const selectedModel = resolveDeepSeekModelSelection(trimmed);
      if (!selectedModel) {
        return {
          message: `Unknown model "${trimmed}". Use /model, /model flash, /model pro, or /model verify.`,
          display: React.createElement(ProjectPanel, {
            model: modelPanelModel({
              model: context.config.model,
              providerName: context.config.provider?.name,
              providerReady: Boolean(context.provider),
            }),
          }),
        };
      }
      const switched = context.switchModel?.(selectedModel) ?? false;
      return {
        message: switched
          ? `Model switched to ${selectedModel}`
          : `Model switch requested: ${selectedModel}. In headless mode, restart with --model ${selectedModel}.`,
        display: React.createElement(ProjectPanel, {
          model: modelPanelModel({
            model: selectedModel,
            providerName: context.config.provider?.name,
            providerReady: Boolean(context.provider),
          }),
        }),
      };
    }
    if (context.requestModelSelector) {
      context.requestModelSelector();
      return {
        message: "Model selector opened. Use Up/Down to choose, Enter to switch, Esc to close.",
      };
    }
    return {
      message: `Current model: ${context.config.model}\nProvider: ${context.config.provider?.name ?? "not configured"}\nUse /model flash, /model pro, or /model verify.`,
      display: React.createElement(ProjectPanel, {
        model: modelPanelModel({
          model: context.config.model,
          providerName: context.config.provider?.name,
          providerReady: Boolean(context.provider),
        }),
      }),
    };
  },
};
