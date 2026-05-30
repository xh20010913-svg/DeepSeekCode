import React from "react";
import type { Command } from "../../types/command.js";
import { OutputStyleService } from "../../services/outputStyles/outputStyleService.js";
import { InferenceSettingsService } from "../../services/inference/inferenceSettingsService.js";
import { buildProjectStatus, formatProjectStatus } from "../../services/status/projectStatus.js";
import { ThemeService } from "../../services/theme/themeService.js";
import { SettingsPanel, normalizeSettingsTab, settingsPanelModel } from "../../components/SettingsPanel.js";

export const settingsCommand: Command = {
  name: "settings",
  aliases: ["setting"],
  description: "Open a Claude-style DeepSeekCode settings overview.",
  usage: "[status|config|usage|gates|theme]",
  execute(args, context) {
    const tab = normalizeSettingsTab(args);
    const outputStyle = new OutputStyleService(context.config.projectPath, context.config.dataDir).current();
    const inference = new InferenceSettingsService(context.config.projectPath).effective();
    const theme = new ThemeService(context.config.projectPath).current();
    const status = buildProjectStatus(context.config, context.state, context.permissions);
    const model = settingsPanelModel({
      tab,
      status,
      outputStyle,
      inference,
      theme,
    });
    return {
      message: [
        `DeepSeekCode settings (${tab})`,
        formatProjectStatus(status),
        `theme: ${theme.theme} (${theme.source})`,
        `style: ${outputStyle.name} (${outputStyle.scope})`,
        `effort: ${inference.effort} maxOutput=${inference.maxOutputTokens}`,
      ].join("\n"),
      display: React.createElement(SettingsPanel, { model }),
    };
  },
};
