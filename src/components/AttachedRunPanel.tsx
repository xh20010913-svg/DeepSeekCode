import React from "react";
import { Box, Text } from "ink";
import type { RunRecord } from "../state/sqlite.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface AttachedRunPanelModel {
  state: "none" | "missing" | "attached";
  status: string;
  tone: TerminalTone;
  title: string;
  detail: string;
  command: string;
}

export function AttachedRunPanel(props: { run?: RunRecord; runId?: string }): React.ReactElement {
  const model = attachedRunPanelModel(props.run, props.runId);
  if (model.state === "none") return <Text color="gray">none</Text>;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <StatusBadge label={model.status} tone={model.tone} />
        <Text color="cyan">{` ${truncateCells(model.title, 20)}`}</Text>
      </Box>
      <Text color="gray">{truncateCells(model.detail, 30)}</Text>
      <Text color="gray">{model.command}</Text>
    </Box>
  );
}

export function attachedRunPanelModel(run?: RunRecord, runId?: string): AttachedRunPanelModel {
  if (!runId) {
    return {
      state: "none",
      status: "none",
      tone: "muted",
      title: "none",
      detail: "no attached run",
      command: "/attach list",
    };
  }

  if (!run) {
    return {
      state: "missing",
      status: "missing",
      tone: "warning",
      title: shortId(runId),
      detail: "attached run is no longer in local state",
      command: "/attach clear",
    };
  }

  return {
    state: "attached",
    status: run.status,
    tone: toneForRunStatus(run.status),
    title: shortId(run.id),
    detail: `${run.actionCount} actions / ${run.artifactCount} artifacts / ${run.eventCount} events`,
    command: firstLine(run.message || "/agents detail attached", 30),
  };
}

function shortId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}...${id.slice(-6)}`;
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}

function toneForRunStatus(status: string): TerminalTone {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running" || status === "paused") return "warning";
  return "muted";
}
