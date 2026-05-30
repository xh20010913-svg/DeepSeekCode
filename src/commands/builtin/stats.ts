import React from "react";
import type { Command } from "../../types/command.js";
import { buildWorkspaceStats, formatWorkspaceStats } from "../../services/stats/workspaceStats.js";
import { MetricsPanel, statsPanelModel } from "../../components/MetricsPanel.js";

export const statsCommand: Command = {
  name: "stats",
  description: "Show aggregate DeepSeekCode run, task, session, and usage statistics.",
  execute(_args, context) {
    const stats = buildWorkspaceStats(context.state, context.config.dataDir);
    return {
      message: formatWorkspaceStats(stats),
      display: React.createElement(MetricsPanel, { model: statsPanelModel(stats) }),
    };
  },
};
