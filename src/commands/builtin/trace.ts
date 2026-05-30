import type { Command } from "../../types/command.js";
import { resolveRunId } from "../runSelection.js";
import React from "react";
import { RuntimePanel, runtimeTracePanelModel, type RuntimeTraceModelInput } from "../../components/RuntimePanel.js";

export const traceCommand: Command = {
  name: "trace",
  description: "Show tasks, actions, artifacts, and events for a run.",
  usage: "<run-id|attached>",
  execute(args, context) {
    const runId = resolveRunId(args, context);
    if (!runId) return { message: "Usage: /trace <run-id>" };
    const trace = context.state.traceRun(runId) as RuntimeTraceModelInput;
    return {
      message: JSON.stringify(trace, null, 2),
      display: React.createElement(RuntimePanel, { model: runtimeTracePanelModel(runId, trace) }),
    };
  },
};
