import React from "react";
import type { Command } from "../../types/command.js";
import { OperationPanel, commandOutputPanelModel, shellPanelModel } from "../../components/OperationPanel.js";
import { defaultShellPolicy, runCommand, summarizeCommand } from "../../tools/shell.js";

export const cmdCommand: Command = {
  name: "cmd",
  description: "Run a local command after shell permission is enabled.",
  usage: "<command>",
  async execute(args, context) {
    const command = args.trim();
    if (!command) return { message: "Usage: /cmd <command>" };
    if (!context.permissions.allowShell) {
      return {
        message: "Shell is off. Run /shell on first.",
        display: React.createElement(OperationPanel, {
          model: shellPanelModel({
            allowShell: context.permissions.allowShell,
            allowBrowser: context.permissions.allowBrowser,
            profile: context.permissions.profile,
          }),
        }),
      };
    }
    const output = await runCommand(context.config.projectPath, command, "", 30_000, {
      ...defaultShellPolicy,
      allowShell: true,
    });
    return {
      message: summarizeCommand(output),
      display: React.createElement(OperationPanel, { model: commandOutputPanelModel(command, output) }),
    };
  },
};
