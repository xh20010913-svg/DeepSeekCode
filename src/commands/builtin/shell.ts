import React from "react";
import type { Command } from "../../types/command.js";
import { OperationPanel, shellPanelModel } from "../../components/OperationPanel.js";
import { markCustomPermissions } from "../../services/permissions/permissionProfiles.js";

export const shellCommand: Command = {
  name: "shell",
  description: "Turn local shell execution permission on or off.",
  usage: "on|off",
  execute(args, context) {
    const mode = args.trim();
    if (mode === "on") markCustomPermissions(context.permissions).allowShell = true;
    if (mode === "off") markCustomPermissions(context.permissions).allowShell = false;
    return {
      message: `shell: ${context.permissions.allowShell ? "on" : "off"}`,
      display: React.createElement(OperationPanel, {
        model: shellPanelModel({
          allowShell: context.permissions.allowShell,
          allowBrowser: context.permissions.allowBrowser,
          profile: context.permissions.profile,
        }),
      }),
    };
  },
};
