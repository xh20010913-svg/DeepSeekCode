import React from "react";
import type { Command } from "../../types/command.js";
import { parseLimit } from "../format.js";
import { RunPanel, runsPanelModel } from "../../components/RunPanel.js";
import { resolveRunId } from "../runSelection.js";
import { writeScenarioReport } from "../../services/testing/scenarioReport.js";

export const runsCommand: Command = {
  name: "runs",
  description: "List recent run records, checkpoints, context snapshots, and scenario reports.",
  usage: "[limit]|checkpoints [latest|current|run-id]|context [latest|current|run-id]|report [latest|current|run-id] [output-dir]",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed === "checkpoints" || trimmed.startsWith("checkpoints ")) {
      const selector = trimmed.startsWith("checkpoints ") ? trimmed.slice("checkpoints ".length).trim() : "latest";
      const runId = selector === "latest" ? context.state.listRuns(1)[0]?.id : resolveRunId(selector, context);
      if (!runId) return { message: "No run is available." };
      const checkpoints = context.state.listCheckpoints(runId, 20);
      if (checkpoints.length === 0) return { message: `${runId} has no checkpoints.` };
      return {
        message: checkpoints.map((checkpoint) => [
          checkpoint.id,
          checkpoint.scope,
          new Date(checkpoint.createdAtMs).toISOString(),
          summarizeSnapshot(checkpoint.snapshot),
        ].join(" ")).join("\n"),
      };
    }
    if (trimmed === "context" || trimmed.startsWith("context ")) {
      const selector = trimmed.startsWith("context ") ? trimmed.slice("context ".length).trim() : "latest";
      const runId = selector === "latest" ? context.state.listRuns(1)[0]?.id : resolveRunId(selector, context);
      if (!runId) return { message: "No run is available." };
      const snapshots = context.state.listContextSnapshots(runId, 20);
      if (snapshots.length === 0) return { message: `${runId} has no context snapshots.` };
      return {
        message: snapshots.map((snapshot) => [
          snapshot.id,
          snapshot.kind,
          new Date(snapshot.createdAtMs).toISOString(),
          summarizeSnapshot(snapshot.content),
        ].join(" ")).join("\n"),
      };
    }
    if (trimmed === "report" || trimmed.startsWith("report ")) {
      const parts = parseArgs(trimmed.slice("report".length).trim());
      const first = parts[0] ?? "latest";
      const outputDir = parts[1] ?? `${context.config.projectPath}\\.deepseekcode\\reports`;
      const runId = first === "latest" ? context.state.listRuns(1)[0]?.id : resolveRunId(first, context);
      if (!runId) return { message: "No run is available to report." };
      try {
        const result = writeScenarioReport({ state: context.state, runId, outputDir });
        return {
          message: [
            `scenario report written for ${result.runId}`,
            result.markdownPath,
            result.jsonPath,
          ].join("\n"),
        };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    const rows = context.state.listRuns(parseLimit(trimmed, 10));
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

function parseArgs(args: string): string[] {
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

function summarizeSnapshot(value: unknown): string {
  const text = JSON.stringify(value ?? {});
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}...`;
}
