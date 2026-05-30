import React from "react";
import { ProjectPanel, modelPanelModel } from "../../components/ProjectPanel.js";
import type { Command } from "../../types/command.js";

export const modelCommand: Command = {
  name: "model",
  description: "Show or verify the active DeepSeek model.",
  usage: "[verify]",
  async execute(args, context) {
    if (args.trim() === "verify") {
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
    return {
      message: `Current model: ${context.config.model}\nProvider: ${context.config.provider?.name ?? "not configured"}`,
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
