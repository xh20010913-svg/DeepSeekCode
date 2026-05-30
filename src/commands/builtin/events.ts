import type { Command } from "../../types/command.js";
import { resolveRunId, stripRunAlias } from "../runSelection.js";
import React from "react";
import { RuntimePanel, runtimeEventsPanelModel } from "../../components/RuntimePanel.js";

export const eventsCommand: Command = {
  name: "events",
  description: "Show recent runtime events.",
  usage: "[run-id|attached|all]",
  execute(args, context) {
    const trimmed = args.trim();
    const runId = trimmed === "all" ? undefined : resolveRunId(stripRunAlias(trimmed), context);
    const rows = context.state.listEvents(runId, 30);
    const scope = trimmed === "all" ? "all" : runId ?? "attached/current";
    const display = React.createElement(RuntimePanel, { model: runtimeEventsPanelModel(rows, scope) });
    if (rows.length === 0) return { message: "No events.", display };
    return {
      message: rows
        .map((event) => `${event.id} ${event.kind} ${event.runId ?? "-"} ${JSON.stringify(event.payload)}`)
        .join("\n"),
      display,
    };
  },
};
