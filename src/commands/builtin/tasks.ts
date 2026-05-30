import React from "react";
import type { Command } from "../../types/command.js";
import { resolveRunId } from "../runSelection.js";
import { RunPanel, tasksPanelModel } from "../../components/RunPanel.js";

export const tasksCommand: Command = {
  name: "tasks",
  description: "List tasks for a run; defaults to the latest run.",
  usage: "[run-id|attached]",
  execute(args, context) {
    const runId = resolveRunId(args, context);
    if (!runId) return { message: "No run records yet." };
    const tasks = context.state.listTasks(runId);
    if (tasks.length === 0) {
      return {
        message: `${runId} has no task records.`,
        display: React.createElement(RunPanel, { model: tasksPanelModel(runId, tasks) }),
      };
    }
    return {
      message: tasks
        .map((task) => `${task.id} ${task.status} ${task.agent} - ${task.title}${task.detail ? ` (${task.detail})` : ""}`)
        .join("\n"),
      display: React.createElement(RunPanel, { model: tasksPanelModel(runId, tasks) }),
    };
  },
};
