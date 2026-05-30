import React from "react";
import type { Command } from "../../types/command.js";
import { ProjectPanel, exportPanelModel } from "../../components/ProjectPanel.js";
import {
  defaultExportPath,
  exportRunTrace,
  exportSessionTranscript,
  exportStatusSnapshot,
  inferExportFormat,
} from "../../services/export/exportService.js";
import { resolveRunId } from "../runSelection.js";

export const exportCommand: Command = {
  name: "export",
  description: "Export run traces, session transcripts, or status snapshots into project files.",
  usage: "run [run-id|attached] [path]|session <session-id> [path]|status [path]",
  execute(args, context) {
    const [kind = "", ...rest] = parseArgs(args);
    try {
      if (kind === "run") {
        const maybeRun = rest[0] ?? "";
        const runId = resolveRunId(maybeRun, context);
        if (!runId) return { message: "Usage: /export run [run-id|attached] [path]" };
        const explicitPath = runId === maybeRun ? rest[1] : rest[0];
        const targetPath = explicitPath || defaultExportPath("run", runId);
        const result = exportRunTrace(context.config.projectPath, context.state, runId, targetPath, inferExportFormat(targetPath));
        return {
          message: `exported run ${runId}: ${result.path} (${result.bytes} bytes)`,
          display: React.createElement(ProjectPanel, { model: exportPanelModel({ kind: "run", id: runId, result }) }),
        };
      }
      if (kind === "session") {
        const sessionId = rest[0] ?? "";
        if (!sessionId) return { message: "Usage: /export session <session-id> [path]" };
        const targetPath = rest[1] || defaultExportPath("session", sessionId);
        const result = exportSessionTranscript(
          context.config.projectPath,
          context.config.dataDir,
          sessionId,
          targetPath,
          inferExportFormat(targetPath),
        );
        return {
          message: `exported session ${sessionId}: ${result.path} (${result.bytes} bytes)`,
          display: React.createElement(ProjectPanel, { model: exportPanelModel({ kind: "session", id: sessionId, result }) }),
        };
      }
      if (kind === "status") {
        const targetPath = rest[0] || defaultExportPath("status");
        const result = exportStatusSnapshot(
          context.config,
          context.state,
          context.permissions,
          targetPath,
          inferExportFormat(targetPath),
        );
        return {
          message: `exported status: ${result.path} (${result.bytes} bytes)`,
          display: React.createElement(ProjectPanel, { model: exportPanelModel({ kind: "status", result }) }),
        };
      }
      return { message: "Usage: /export run [run-id|attached] [path]|session <session-id> [path]|status [path]" };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  },
};

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
