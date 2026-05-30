import React from "react";
import { Box, Text } from "ink";
import { ToolUseLoader, type ToolUseLoaderStatus } from "./ToolUseLoader.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";
import { flattenCellText, truncateCells } from "./design/textLayout.js";

export type ToolProgressStatus = ToolUseLoaderStatus;

export interface ToolProgressModel {
  name: string;
  status: ToolProgressStatus;
  statusLabel: string;
  tone: TerminalTone;
  detail?: string;
}

export function ToolProgress(props: {
  name: string;
  status: ToolProgressStatus;
  detail?: string;
}): React.ReactElement {
  const model = toolProgressModel(props);
  return (
    <Box flexDirection="row">
      <ToolUseLoader status={model.status} />
      <Text color={toneColor(model.tone)}>{model.statusLabel} </Text>
      <Text>{model.name}</Text>
      {model.detail ? <Text dimColor>{` - ${model.detail}`}</Text> : null}
    </Box>
  );
}

export function toolProgressModel(props: {
  name: string;
  status: ToolProgressStatus;
  detail?: string;
  detailWidth?: number;
}): ToolProgressModel {
  return {
    name: flattenCellText(props.name).trim() || "tool",
    status: props.status,
    statusLabel: toolProgressStatusLabel(props.status),
    tone: toolProgressTone(props.status),
    detail: normalizeToolProgressDetail(props.detail, props.detailWidth ?? 96),
  };
}

export function toolProgressStatusLabel(status: ToolProgressStatus): string {
  if (status === "succeeded") return "done";
  if (status === "failed") return "failed";
  if (status === "queued") return "queued";
  return "running";
}

export function toolProgressTone(status: ToolProgressStatus): TerminalTone {
  if (status === "failed") return "error";
  if (status === "succeeded") return "success";
  if (status === "queued") return "muted";
  return "warning";
}

function normalizeToolProgressDetail(value: string | undefined, width: number): string | undefined {
  const normalized = flattenCellText(value ?? "").trim();
  if (!normalized) return undefined;
  return truncateCells(normalized, width);
}
