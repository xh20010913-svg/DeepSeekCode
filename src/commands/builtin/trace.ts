import type { Command } from "../../types/command.js";
import { resolveRunId } from "../runSelection.js";
import React from "react";
import { RuntimePanel, runtimeTracePanelModel, type RuntimeTraceModelInput } from "../../components/RuntimePanel.js";

export const traceCommand: Command = {
  name: "trace",
  description: "Show tasks, actions, artifacts, and events for a run.",
  usage: "[attached|current]",
  execute(args, context) {
    const runId = resolveRunId(args, context);
    if (!runId) return { message: "Usage: /trace attached" };
    const trace = context.state.traceRun(runId) as RuntimeTraceModelInput;
    return {
      message: formatTraceSummary(trace),
      display: React.createElement(RuntimePanel, { model: runtimeTracePanelModel(runId, trace) }),
    };
  },
};

function formatTraceSummary(trace: RuntimeTraceModelInput): string {
  const tasks = trace.tasks ?? [];
  const actions = trace.actions ?? [];
  const artifacts = trace.artifacts ?? [];
  const events = trace.events ?? [];
  const run = trace.run ?? {};
  return [
    "run trace",
    `status=${textField(run, "status", "missing")}`,
    `tasks=${tasks.length} actions=${actions.length} artifacts=${artifacts.length} events=${events.length}`,
    tasks.length ? "tasks:" : "",
    ...tasks.slice(0, 8).map((task, index) => {
      const title = [textField(task, "agent", ""), textField(task, "title", "")].filter(Boolean).join(": ");
      const detail = textField(task, "detail", "");
      return `- task ${index + 1} ${textField(task, "status", "task")} ${title}${detail ? ` (${detail})` : ""}`;
    }),
    actions.length ? "actions:" : "",
    ...actions.slice(0, 8).map((action, index) => [
      `- action ${index + 1}`,
      textField(action, "status", "action"),
      textField(action, "action_type", ""),
      textField(action, "path", ""),
      textField(action, "message", ""),
    ].filter(Boolean).join(" ")),
    artifacts.length ? "artifacts:" : "",
    ...artifacts.slice(0, 6).map((artifact, index) => [
      `- artifact ${index + 1}`,
      textField(artifact, "kind", "artifact"),
      textField(artifact, "path", ""),
    ].filter(Boolean).join(" ")),
    events.length ? "events:" : "",
    ...events.slice(0, 8).map((event, index) => `- event ${index + 1} ${event.kind} ${redactInternalIds(JSON.stringify(event.payload ?? {}))}`),
  ].filter(Boolean).join("\n");
}

function textField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  if (value === undefined || value === null || value === "") return fallback;
  return redactInternalIds(String(value));
}

function redactInternalIds(text: string): string {
  return text
    .replace(/\brun_[0-9a-f-]{8,}\b/gi, "current run")
    .replace(/\btask_[0-9a-f-]{8,}\b/gi, "agent task")
    .replace(/\bapproval_[0-9a-f-]{8,}\b/gi, "approval")
    .replace(/\bquestion_[0-9a-f-]{8,}\b/gi, "question");
}
