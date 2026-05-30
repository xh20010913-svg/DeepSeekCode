import type { Command } from "../../types/command.js";
import { readRuntimeLog } from "../../services/logging/runtimeLog.js";
import React from "react";
import { RuntimePanel, runtimeLogsPanelModel } from "../../components/RuntimePanel.js";

export const logsCommand: Command = {
  name: "logs",
  description: "Show local runtime logs.",
  execute(_args, context) {
    const rows = readRuntimeLog(context.config.dataDir, 50);
    const display = React.createElement(RuntimePanel, { model: runtimeLogsPanelModel(rows) });
    if (rows.length === 0) return { message: "No runtime logs yet.", display };
    return {
      message: rows
        .map((row) => `${row.level} ${row.message}${row.metadata ? ` ${JSON.stringify(row.metadata)}` : ""}`)
        .join("\n"),
      display,
    };
  },
};
