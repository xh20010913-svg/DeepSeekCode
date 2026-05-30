import React from "react";
import {
  WorkspacePanel,
  checkpointCreatedPanelModel,
  checkpointDetailPanelModel,
  checkpointDiffPanelModel,
  checkpointListPanelModel,
  checkpointPathPanelModel,
  checkpointRestorePanelModel,
} from "../../components/WorkspacePanel.js";
import type { Command } from "../../types/command.js";
import { WorkspaceCheckpointService } from "../../services/rewind/workspaceCheckpointService.js";

export const rewindCommand: Command = {
  name: "rewind",
  aliases: ["checkpoint"],
  description: "Create, inspect, diff, and restore local workspace checkpoints.",
  usage: "[list|create [label]|show <id>|diff <id> [path]|restore <id> [--delete-new]|path]",
  execute(args, context) {
    const service = new WorkspaceCheckpointService(context.config.projectPath);
    const tokens = splitArgs(args);
    const [mode = "list", ...rest] = tokens;

    try {
      if (mode === "list") {
        const checkpoints = service.list();
        return {
          message: checkpoints.length
            ? checkpoints.map((checkpoint) =>
                [
                  checkpoint.id,
                  checkpoint.fileCount,
                  `${checkpoint.totalBytes}b`,
                  checkpoint.truncated ? "truncated" : "complete",
                  checkpoint.label,
                ].join(" "),
              ).join("\n")
            : "No checkpoints. Use /rewind create [label] before risky edits.",
          display: React.createElement(WorkspacePanel, {
            model: checkpointListPanelModel(checkpoints, service.dir()),
          }),
        };
      }

      if (mode === "create") {
        const checkpoint = service.create(rest.join(" ") || "manual checkpoint");
        return {
          message: [
            `created checkpoint ${checkpoint.id}`,
            `label=${checkpoint.label}`,
            `files=${checkpoint.fileCount} bytes=${checkpoint.totalBytes} truncated=${checkpoint.truncated}`,
          ].join("\n"),
          display: React.createElement(WorkspacePanel, {
            model: checkpointCreatedPanelModel(checkpoint),
          }),
        };
      }

      if (mode === "show") {
        const id = rest[0];
        if (!id) return { message: "Usage: /rewind show <id>" };
        const checkpoint = service.read(id);
        return {
          message: [
            checkpoint.id,
            `label=${checkpoint.label}`,
            `created=${new Date(checkpoint.createdAtMs).toISOString()}`,
            `files=${checkpoint.fileCount} bytes=${checkpoint.totalBytes} truncated=${checkpoint.truncated}`,
            ...checkpoint.files.slice(0, 80).map((file) => `${file.path} ${file.size}b ${file.sha256.slice(0, 12)}`),
            checkpoint.files.length > 80 ? "...truncated..." : "",
          ].filter(Boolean).join("\n"),
          display: React.createElement(WorkspacePanel, {
            model: checkpointDetailPanelModel(checkpoint),
          }),
        };
      }

      if (mode === "diff") {
        const id = rest[0];
        if (!id) return { message: "Usage: /rewind diff <id> [path]" };
        const diff = service.diff(id, rest[1]);
        return {
          message: [
            `checkpoint diff ${id} changed=${diff.changed} added=${diff.added} removed=${diff.removed}`,
            diff.diff,
          ].join("\n"),
          display: React.createElement(WorkspacePanel, {
            model: checkpointDiffPanelModel(id, diff),
          }),
        };
      }

      if (mode === "restore") {
        const id = rest[0];
        if (!id) return { message: "Usage: /rewind restore <id> [--delete-new]" };
        const result = service.restore(id, { deleteNew: rest.includes("--delete-new") });
        return {
          message:
            `restored checkpoint ${id} restored=${result.restored} deleted=${result.deleted} skipped=${result.skipped}`,
          display: React.createElement(WorkspacePanel, {
            model: checkpointRestorePanelModel(id, result, rest.includes("--delete-new")),
          }),
        };
      }

      if (mode === "path") {
        return {
          message: service.dir(),
          display: React.createElement(WorkspacePanel, {
            model: checkpointPathPanelModel(service.dir()),
          }),
        };
      }

      return {
        message: "Usage: /rewind [list|create [label]|show <id>|diff <id> [path]|restore <id> [--delete-new]|path]",
      };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  },
};

function splitArgs(input: string): string[] {
  return [...input.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
