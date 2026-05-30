import React from "react";
import type { Command } from "../../types/command.js";
import { parseLimit } from "../format.js";
import { RunPanel, runsPanelModel } from "../../components/RunPanel.js";

export const runsCommand: Command = {
  name: "runs",
  description: "List recent run records.",
  usage: "[limit]",
  execute(args, context) {
    const rows = context.state.listRuns(parseLimit(args, 10));
    if (rows.length === 0) {
      return {
        message: "No run records yet.",
        display: React.createElement(RunPanel, { model: runsPanelModel(rows) }),
      };
    }
    return {
      message: rows
        .map((run) => `${run.id} ${run.status} actions=${run.actionCount} artifacts=${run.artifactCount} ${run.message}`)
        .join("\n"),
      display: React.createElement(RunPanel, { model: runsPanelModel(rows) }),
    };
  },
};
