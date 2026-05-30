import React from "react";
import type { Command } from "../../types/command.js";
import { OutputStyleService } from "../../services/outputStyles/outputStyleService.js";
import { InferenceSettingsService } from "../../services/inference/inferenceSettingsService.js";
import { ConfigPanel, configPanelModel } from "../../components/ConfigPanel.js";

export const configCommand: Command = {
  name: "config",
  description: "Show runtime configuration without secrets.",
  execute(_args, context) {
    const provider = context.config.provider;
    const outputStyle = new OutputStyleService(context.config.projectPath, context.config.dataDir).current();
    const inference = new InferenceSettingsService(context.config.projectPath).effective();
    const model = configPanelModel({
      config: context.config,
      outputStyle,
      inference,
      permissions: context.permissions,
    });
    return {
      message: JSON.stringify({
        product: "DeepSeekCode",
        projectPath: context.config.projectPath,
        dataDir: context.config.dataDir,
        stateDbPath: context.config.stateDbPath,
        model: context.config.model,
        provider: provider
          ? {
              name: provider.name,
              kind: provider.kind,
              baseUrl: provider.baseUrl,
              model: provider.model,
              timeoutSecs: provider.timeoutSecs,
              reasoningEffort: provider.reasoningEffort,
              maxOutputTokens: provider.maxOutputTokens,
              apiKey: provider.apiKey ? "[redacted]" : "",
            }
          : null,
        outputStyle: {
          name: outputStyle.name,
          scope: outputStyle.scope,
        },
        inference,
        permissions: context.permissions,
      }, null, 2),
      display: React.createElement(ConfigPanel, { model }),
    };
  },
};
