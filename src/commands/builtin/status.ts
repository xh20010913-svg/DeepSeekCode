import React from "react";
import type { Command } from "../../types/command.js";
import { buildProjectStatus, formatProjectStatus } from "../../services/status/projectStatus.js";
import { StatusPanel, statusPanelModel } from "../../components/StatusPanel.js";

export const statusCommand: Command = {
  name: "status",
  description: "Show project, provider, permission, cache, run, task, gate, and git status.",
  execute(_args, context) {
    const status = buildProjectStatus(context.config, context.state, context.permissions);
    return {
      message: formatProjectStatus(status),
      display: React.createElement(StatusPanel, { model: statusPanelModel(status) }),
    };
  },
};
