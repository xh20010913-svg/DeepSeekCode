import React from "react";
import type { Command } from "../../types/command.js";
import { DurableTaskQueue } from "../../tasks/queue.js";
import { resolveRunId } from "../runSelection.js";
import { RunPanel, queuePanelModel } from "../../components/RunPanel.js";

export const queueCommand: Command = {
  name: "queue",
  description: "Show runnable queued tasks for a run.",
  usage: "[run-id|attached]",
  execute(args, context) {
    const runId = resolveRunId(args, context);
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
