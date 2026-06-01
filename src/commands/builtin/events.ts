import type { Command } from "../../types/command.js";
import { resolveRunId, stripRunAlias } from "../runSelection.js";
import React from "react";
import { RuntimePanel, runtimeEventsPanelModel } from "../../components/RuntimePanel.js";

export const eventsCommand: Command = {
  name: "events",
  description: "Show recent runtime events.",
  usage: "[attached|current|all]",
  execute(args, context) {
    const trimmed = args.trim();
    const runId = trimmed === "all" ? undefined : resolveRunId(stripRunAlias(trimmed), context);
    const rows = context.state.listEvents(runId, 30);
    const scope = trimmed === "all" ? "all" : runId ? "attached/current" : "all";
    const display = React.createElement(RuntimePanel, { model: runtimeEventsPanelModel(rows, scope) });
    if (rows.length === 0) return { message: "No events.", display };
    return {
      message: rows
        .map((event, index) => `event ${index + 1} ${event.kind} ${redactInternalIds(JSON.stringify(event.payload ?? {}))}`)
        .join("\n"),
      display,
    };
  },
};

function redactInternalIds(text: string): string {
  return text
    .replace(/\brun_[0-9a-f-]{8,}\b/gi, "current run")
    .replace(/\btask_[0-9a-f-]{8,}\b/gi, "agent task")
    .replace(/\bapproval_[0-9a-f-]{8,}\b/gi, "approval")
    .replace(/\bquestion_[0-9a-f-]{8,}\b/gi, "question");
}
