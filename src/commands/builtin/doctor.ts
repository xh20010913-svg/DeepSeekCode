import React from "react";
import type { Command } from "../../types/command.js";
import { DiagnosticsDisplay, diagnosticsDisplayModel } from "../../components/DiagnosticsDisplay.js";

export const doctorCommand: Command = {
  name: "doctor",
  description: "Check project, data, provider, and permission status.",
  execute(_args, context) {
    const provider = context.config.provider;
    const runs = context.state.listRuns(5);
    return {
      message: [
        "DeepSeekCode doctor",
        `project: ${context.config.projectPath}`,
        `data: ${context.config.dataDir}`,
        `state: ${context.config.stateDbPath}`,
        `model: ${context.config.model}`,
        `provider: ${provider ? `${provider.name} (${provider.baseUrl})` : "missing DEEPSEEK_API_KEY"}`,
        `permission profile: ${context.permissions.profile ?? context.config.permissionProfile}`,
        `shell: ${context.permissions.allowShell ? "on" : "off"}`,
        `browser: ${context.permissions.allowBrowser ? "on" : "off"}`,
      ].join("\n"),
      display: React.createElement(DiagnosticsDisplay, {
        model: diagnosticsDisplayModel({
          config: context.config,
          providerReady: Boolean(context.provider),
          providerName: provider?.name,
          permissions: context.permissions,
          runs,
        }),
      }),
    };
  },
};
