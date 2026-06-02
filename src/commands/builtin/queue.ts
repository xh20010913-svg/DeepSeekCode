import React from "react";
import type { Command } from "../../types/command.js";
import { DurableTaskQueue } from "../../tasks/queue.js";
import { resolveRunId } from "../runSelection.js";
import { RunPanel, queuePanelModel } from "../../components/RunPanel.js";

export const queueCommand: Command = {
  name: "queue",
  description: "Show runnable queued tasks or persistent jobs.",
  usage: "[run-id|attached]|jobs [run-id|attached|all]",
  execute(args, context) {
    const trimmed = args.trim();
    if (trimmed === "jobs" || trimmed.startsWith("jobs ")) {
      const selector = trimmed.startsWith("jobs ") ? trimmed.slice("jobs ".length).trim() : "attached";
      const runId = selector === "all" ? undefined : resolveRunId(selector, context);
      if (selector !== "all" && !runId) return { message: "No run records yet." };
      const jobs = context.state.listJobs({ runId, limit: 50 });
      if (jobs.length === 0) return { message: runId ? `${runId} has no persistent jobs.` : "No persistent jobs." };
      return {
        message: jobs.map((job) => [
          job.id,
          job.status,
          job.kind,
          `attempts=${job.attempts}/${job.maxAttempts}`,
          job.lockedBy ? `locked_by=${job.lockedBy}` : "",
          job.detail,
        ].filter(Boolean).join(" ")).join("\n"),
      };
    }
    const runId = resolveRunId(trimmed, context);
    if (!runId) return { message: "No run records yet." };
    const queue = new DurableTaskQueue(context.state);
    const runnable = queue.runnable(runId, 20);
    const all = context.state.listTasks(runId);
    if (all.length === 0) {
      return {
        message: `${runId} has no tasks.`,
        display: React.createElement(RunPanel, {
          model: queuePanelModel({
            runId,
            tasks: all,
            runnableIds: new Set(),
            dependenciesByTaskId: new Map(),
          }),
        }),
      };
    }

    const runnableIds = new Set(runnable.map((task) => task.id));
    const dependenciesByTaskId = new Map(all.map((task) => [
      task.id,
      context.state.listTaskDependencies(task.id).map((dep) => dep.dependsOnTaskId),
    ]));
    return {
      message: all
        .map((task) => {
          const deps = dependenciesByTaskId.get(task.id) ?? [];
          const state = runnableIds.has(task.id) ? "runnable" : task.status;
          const depText = deps.length ? ` deps=${deps.join(",")}` : "";
          return `${task.id} ${state} ${task.agent}: ${task.title}${depText}`;
        })
        .join("\n"),
      display: React.createElement(RunPanel, {
        model: queuePanelModel({
          runId,
          tasks: all,
          runnableIds,
          dependenciesByTaskId,
        }),
      }),
    };
  },
};
