import React from "react";
import type { Command } from "../../types/command.js";
import { buildProjectStatus, formatProjectStatus } from "../../services/status/projectStatus.js";
import { StatusPanel, statusPanelModel } from "../../components/StatusPanel.js";

export const statusCommand: Command = {
  name: "status",
  description: "Show project, provider, permission, cache, run, task, gate, and git status.",
  usage: "[full]",
  execute(args, context) {
    const status = buildProjectStatus(context.config, context.state, context.permissions);
    if (args.trim() === "full") {
      return {
        message: formatFullStatus(context, formatProjectStatus(status)),
        display: React.createElement(StatusPanel, { model: statusPanelModel(status) }),
      };
    }
    return {
      message: formatProjectStatus(status),
      display: React.createElement(StatusPanel, { model: statusPanelModel(status) }),
    };
  },
};

function formatFullStatus(context: Parameters<Command["execute"]>[1], summary: string): string {
  const latest = context.state.listRuns(1)[0];
  if (!latest) return summary;
  const tasks = context.state.listTasks(latest.id);
  const events = context.state.listEvents(latest.id, 8);
  const jobs = context.state.listJobs({ runId: latest.id, limit: 8 });
  const artifacts = context.state.traceRun(latest.id) as {
    artifacts?: Array<{ kind?: string; path?: string; createdAtMs?: number }>;
  };
  const now = Date.now();
  const staleMs = now - latest.updatedAtMs;
  const staleReason = latest.status === "running" && staleMs > 90_000
    ? `possible stall: no run status update for ${formatDuration(staleMs)}`
    : "none";
  return [
    summary,
    "",
    "DeepSeekCode status detail",
    `latest run: ${redactRunId(latest.id)} ${latest.status} updated ${formatDuration(staleMs)} ago`,
    `message: ${latest.message || "(none)"}`,
    `stale: ${staleReason}`,
    "tasks:",
    ...(tasks.length
      ? tasks.slice(0, 8).map((task) => `- ${task.status} ${task.agent}: ${trim(task.title, 120)}`)
      : ["- none"]),
    "jobs:",
    ...(jobs.length
      ? jobs.map((job) => `- ${job.status} ${job.kind}: ${trim(job.detail, 120)}`)
      : ["- none"]),
    "artifacts:",
    ...((artifacts.artifacts ?? []).length
      ? (artifacts.artifacts ?? []).slice(0, 8).map((artifact) => `- ${artifact.kind ?? "file"} ${artifact.path ?? "(unknown)"}`)
      : ["- none"]),
    "recent events:",
    ...(events.length
      ? events.map((event) => `- ${event.kind}: ${trim(JSON.stringify(event.payload ?? {}), 140)}`)
      : ["- none"]),
  ].join("\n");
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m${rest ? `${rest}s` : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

function trim(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 3)}...`;
}

function redactRunId(value: string): string {
  return value.replace(/^run_[0-9a-f-]+$/i, "latest");
}
