import React from "react";
import { RunPanel, runControlPanelModel } from "../../components/RunPanel.js";
import type { Command } from "../../types/command.js";
import { DurableTaskQueue } from "../../tasks/queue.js";
import { resolveRunId } from "../runSelection.js";

export const pauseCommand: Command = {
  name: "pause",
  description: "Pause a run so workers stop claiming new tasks.",
  usage: "<run-id> [reason]",
  execute(args, context) {
    const [runId, ...reasonParts] = args.trim().split(/\s+/);
    if (!runId) return { message: "Usage: /pause <run-id> [reason]" };
    const reason = reasonParts.join(" ") || "paused by user";
    new DurableTaskQueue(context.state).pauseRun(runId, reason);
    return {
      message: `${runId} paused`,
      display: React.createElement(RunPanel, {
        model: runControlPanelModel({ runId, run: context.state.getRun(runId), action: "paused", reason }),
      }),
    };
  },
};

export const resumeCommand: Command = {
  name: "run-resume",
  aliases: ["unpause"],
  description: "Resume a paused run.",
  usage: "<run-id> [reason]",
  execute(args, context) {
    const [runId, ...reasonParts] = args.trim().split(/\s+/);
    if (!runId) return { message: "Usage: /run-resume <run-id> [reason]" };
    const reason = reasonParts.join(" ") || "resumed by user";
    new DurableTaskQueue(context.state).resumeRun(runId, reason);
    return {
      message: `${runId} resumed`,
      display: React.createElement(RunPanel, {
        model: runControlPanelModel({ runId, run: context.state.getRun(runId), action: "resumed", reason }),
      }),
    };
  },
};

export const cancelCommand: Command = {
  name: "cancel",
  description: "Cancel a run.",
  usage: "<run-id> [reason]",
  execute(args, context) {
    const [runId, ...reasonParts] = args.trim().split(/\s+/);
    if (!runId) return { message: "Usage: /cancel <run-id> [reason]" };
    const reason = reasonParts.join(" ") || "cancelled by user";
    new DurableTaskQueue(context.state).cancelRun(runId, reason);
    return {
      message: `${runId} cancelled`,
      display: React.createElement(RunPanel, {
        model: runControlPanelModel({ runId, run: context.state.getRun(runId), action: "cancelled", reason }),
      }),
    };
  },
};

export const retryCommand: Command = {
  name: "retry",
  description: "Retry failed or selected tasks in a run and requeue its persistent job.",
  usage: "[run-id|attached|current|latest] [failed|all|task-id] [reason]",
  execute(args, context) {
    const parts = parseArgs(args.trim());
    const selector = parts[0] ?? "latest";
    const runId = selector === "latest" ? context.state.listRuns(1)[0]?.id : resolveRunId(selector, context);
    if (!runId) return { message: "No run records yet." };
    const target = parts[1] ?? "failed";
    const reason = parts.slice(2).join(" ") || "retry requested";
    const queue = new DurableTaskQueue(context.state);
    const tasks = context.state.listTasks(runId);
    const candidates = selectRetryTasks(tasks, target);
    if (candidates.length === 0) {
      return {
        message: `No retryable tasks matched ${target} for ${runId}.`,
        display: React.createElement(RunPanel, {
          model: runControlPanelModel({ runId, run: context.state.getRun(runId), action: "retry", reason }),
        }),
      };
    }

    const retried = candidates.map((task) => queue.retry(task.id, reason));
    const job = context.state.ensureRunJob({
      runId,
      kind: "agent_run",
      payload: { runId },
      detail: reason,
      maxAttempts: 5,
    });
    context.state.retryJob(job.id, reason);
    return {
      message: [
        `${runId} retry queued`,
        `tasks=${retried.length}`,
        `job=${job.kind} attempts reset`,
        ...retried.map((task) => `- ${task.id} queued ${task.agent}: ${task.title}`),
      ].join("\n"),
      display: React.createElement(RunPanel, {
        model: runControlPanelModel({ runId, run: context.state.getRun(runId), action: "retry", reason }),
      }),
    };
  },
};

function selectRetryTasks(
  tasks: ReturnType<typeof DurableTaskQueue.prototype.runnable>,
  target: string,
) {
  if (target === "all") {
    return tasks.filter((task) => task.status !== "succeeded");
  }
  if (target === "failed") {
    return tasks.filter((task) => task.status === "failed" || task.status === "cancelled");
  }
  if (target === "running") {
    return tasks.filter((task) => task.status === "running");
  }
  return tasks.filter((task) => task.id === target);
}

function parseArgs(args: string): string[] {
  if (!args) return [];
  return [...args.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}
