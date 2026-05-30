import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface AgentProgressLineModel {
  key: string;
  agent: string;
  description: string;
  status: string;
  tone: TerminalTone;
  connector: "`-" | "|-" | "  ";
  selected: boolean;
  viewed: boolean;
  meta: string;
  activity: string;
}

export function agentProgressLineModel(input: {
  key: string;
  agent: string;
  description: string;
  status: string;
  index?: number;
  total?: number;
  selected?: boolean;
  viewed?: boolean;
  toolUseCount?: number;
  tokenCount?: number;
  queuedCount?: number;
  elapsedMs?: number;
  activity?: string;
}): AgentProgressLineModel {
  const index = input.index ?? 0;
  const total = input.total ?? 1;
  const connector = total <= 1 ? "  " : index === total - 1 ? "`-" : "|-";
  return {
    key: input.key,
    agent: input.agent,
    description: input.description,
    status: input.status,
    tone: agentProgressTone(input.status),
    connector,
    selected: input.selected ?? index === 0,
    viewed: input.viewed ?? false,
    meta: agentProgressMeta(input),
    activity: input.activity ?? agentProgressActivity(input.status),
  };
}

export function AgentProgressLine(props: {
  model: AgentProgressLineModel;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 96;
  const prefix = props.model.selected ? "> " : "  ";
  const viewed = props.model.viewed ? "*" : "o";
  const label = `${prefix}${props.model.connector} ${viewed} ${props.model.agent}`;
  const labelWidth = Math.max(14, Math.min(28, Math.floor(width * 0.28)));
  const bodyWidth = Math.max(16, width - labelWidth - 20);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={toneColor(props.model.selected ? "brand" : "muted")}>
          {truncateCells(label.padEnd(labelWidth), labelWidth)}
        </Text>
        <StatusBadge label={props.model.status} tone={props.model.tone} />
        <Text color="gray"> </Text>
        <Text color={toneColor(props.model.tone)}>
          {truncateCells(props.model.description, bodyWidth)}
        </Text>
      </Box>
      <Box paddingLeft={Math.min(labelWidth, 28)}>
        <Text color="gray">
          {truncateCells([props.model.activity, props.model.meta].filter(Boolean).join(" | "), Math.max(18, width - labelWidth - 2))}
        </Text>
      </Box>
    </Box>
  );
}

function agentProgressMeta(input: {
  toolUseCount?: number;
  tokenCount?: number;
  queuedCount?: number;
  elapsedMs?: number;
}): string {
  return [
    input.elapsedMs !== undefined ? formatDuration(input.elapsedMs) : "",
    input.toolUseCount !== undefined ? `${input.toolUseCount} tool${input.toolUseCount === 1 ? "" : "s"}` : "",
    input.tokenCount !== undefined ? `${formatNumber(input.tokenCount)} tokens` : "",
    input.queuedCount !== undefined && input.queuedCount > 0 ? `${input.queuedCount} queued` : "",
  ].filter(Boolean).join(" | ");
}

function agentProgressActivity(status: string): string {
  if (status === "running" || status === "queued" || status === "runnable") return "ready for agent work";
  if (status === "succeeded" || status === "ok") return "completed";
  if (status === "failed" || status === "cancelled") return "needs attention";
  if (status === "paused" || status === "max_steps") return "waiting";
  return "idle";
}

function agentProgressTone(status: string): TerminalTone {
  if (status === "succeeded" || status === "ok" || status === "runnable") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running" || status === "queued" || status === "paused" || status === "max_steps") return "warning";
  return "muted";
}

function formatNumber(value: number): string {
  return Math.trunc(value).toLocaleString("en-US");
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
