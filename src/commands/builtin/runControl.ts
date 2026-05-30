import React from "react";
import { RunPanel, runControlPanelModel } from "../../components/RunPanel.js";
import type { Command } from "../../types/command.js";
import { DurableTaskQueue } from "../../tasks/queue.js";

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
