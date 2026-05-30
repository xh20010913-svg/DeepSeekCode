import React from "react";
import {
  WorkspacePanel,
  attachActionPanelModel,
  attachClearedPanelModel,
  attachCurrentPanelModel,
  attachListPanelModel,
} from "../../components/WorkspacePanel.js";
import type { Command } from "../../types/command.js";
import { AttachService } from "../../services/attach/attachService.js";

export const attachCommand: Command = {
  name: "attach",
  description: "Attach the TUI focus to an unfinished run.",
  usage: "list|latest|use <run-id>|current|clear",
  execute(args, context) {
    const service = new AttachService(context.state, context.config.projectPath);
    const trimmed = args.trim();

    if (!trimmed || trimmed === "current") {
      const current = service.current();
      const display = React.createElement(WorkspacePanel, { model: attachCurrentPanelModel(current) });
      if (!current.runId) return { message: "No attached run.", display };
      if (!current.run) return { message: `Attached run is missing: ${current.runId}`, display };
      return { message: formatRun(current.run), display };
    }

    if (trimmed === "list") {
      const runs = service.listUnfinished(20);
      const current = service.current();
      const display = React.createElement(WorkspacePanel, {
        model: attachListPanelModel(runs, current.runId),
      });
      if (runs.length === 0) return { message: "No unfinished runs for this project.", display };
      return { message: runs.map(formatRun).join("\n"), display };
    }

    if (trimmed === "latest") {
      try {
        const run = service.attachLatest();
        return {
          message: `attached ${formatRun(run)}`,
          display: React.createElement(WorkspacePanel, { model: attachActionPanelModel(run, "attached") }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }

    if (trimmed.startsWith("use ")) {
      const runId = trimmed.slice("use ".length).trim();
      if (!runId) return { message: "Usage: /attach use <run-id>" };
      try {
        const run = service.attach(runId);
        return {
          message: `attached ${formatRun(run)}`,
          display: React.createElement(WorkspacePanel, { model: attachActionPanelModel(run, "attached") }),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }

    if (trimmed === "clear") {
      const current = service.current();
      service.clear();
      return {
        message: "Attached run cleared.",
        display: React.createElement(WorkspacePanel, { model: attachClearedPanelModel(current.runId) }),
      };
    }

    return { message: "Usage: /attach list|latest|use <run-id>|current|clear" };
  },
};

function formatRun(run: { id: string; status: string; actionCount: number; artifactCount: number; message: string }): string {
  return `${run.id} ${run.status} actions=${run.actionCount} artifacts=${run.artifactCount} ${run.message}`;
}
