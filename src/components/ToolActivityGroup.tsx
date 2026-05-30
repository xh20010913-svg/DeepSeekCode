import React from "react";
import { Box, Text } from "ink";
import { inferToolResultTone, toolResultBody, toolResultTitle } from "./ToolResultMessage.js";
import { parseToolStartText } from "./ToolStartMessage.js";
import { MessageResponse, type MessageTone } from "./MessageResponse.js";
import { parseToolResultDetail } from "./ToolResultDetail.js";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor } from "./design/terminalTheme.js";

export interface ToolActivitySourceItem {
  role: "tool" | "tool-start";
  text: string;
}

export interface ToolActivityRecord {
  action: string;
  status: string;
  detail?: string;
  tone: MessageTone;
}

export interface ToolActivitySummary {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
  warnings: number;
  tone: MessageTone;
  state: StatusIconState;
  title: string;
  counts: { action: string; count: number }[];
  latest: string[];
}

export function ToolActivityGroup(props: {
  items: ToolActivitySourceItem[];
  detailWidth?: number;
}): React.ReactElement {
  const summary = buildToolActivitySummary(props.items, props.detailWidth);
  return (
    <MessageResponse tone={summary.tone}>
      <Box flexDirection="column">
        <Box flexDirection="row">
          <StatusIcon state={summary.state} withSpace />
          <Text color={toneColor(summary.tone)}>{summary.title}</Text>
        </Box>
        <Text color="gray">{formatToolActivityCounts(summary)}</Text>
        {summary.latest.map((line, index) => (
          <Text key={`${index}-${line}`} color="gray">{`  ${line}`}</Text>
        ))}
      </Box>
    </MessageResponse>
  );
}

export function buildToolActivitySummary(
  items: ToolActivitySourceItem[],
  detailWidth = 96,
): ToolActivitySummary {
  const records = items.map((item) => parseToolActivityRecord(item, detailWidth));
  const counts = actionCounts(records);
  const running = records.filter((record) => record.status === "running" || record.status === "started").length;
  const failed = records.filter((record) => record.tone === "error").length;
  const warnings = records.filter((record) => record.tone === "warning").length;
  const succeeded = records.filter((record) => record.tone === "success").length;
  const tone = failed > 0 ? "error" : warnings > 0 || running > 0 ? "warning" : succeeded > 0 ? "success" : "default";
  const state: StatusIconState = failed > 0 ? "error" : running > 0 ? "loading" : warnings > 0 ? "warning" : "success";
  const total = records.length;

  return {
    total,
    running,
    succeeded,
    failed,
    warnings,
    tone,
    state,
    title: `${running > 0 ? "Running" : "Ran"} ${total} tool event${total === 1 ? "" : "s"}`,
    counts,
    latest: records.slice(-2).map((record) => formatToolActivityRecord(record, detailWidth)),
  };
}

export function parseToolActivityRecord(
  item: ToolActivitySourceItem,
  detailWidth = 96,
): ToolActivityRecord {
  if (item.role === "tool-start") {
    const info = parseToolStartText(item.text, detailWidth);
    return {
      action: info.name,
      status: "running",
      ...(info.detail ? { detail: info.detail } : {}),
      tone: "warning",
    };
  }

  const title = toolResultTitle(item.text);
  const body = toolResultBody(item.text);
  const detail = parseToolResultDetail(title, body);
  const tone = inferToolResultTone(item.text);
  if (detail) {
    return {
      action: detail.action,
      status: detail.status,
      ...(detail.target ? { detail: detail.target } : detail.message ? { detail: detail.message } : {}),
      tone,
    };
  }

  const [action = "tool", status = tone === "default" ? "done" : tone] = title.split(/\s+/);
  return {
    action,
    status,
    ...(body ? { detail: body } : {}),
    tone,
  };
}

export function formatToolActivityCounts(summary: ToolActivitySummary): string {
  const actionSummary = summary.counts
    .slice(0, 4)
    .map((entry) => `${entry.action} ${entry.count}`)
    .join(", ");
  const statusParts = [
    summary.running > 0 ? `running ${summary.running}` : "",
    summary.succeeded > 0 ? `ok ${summary.succeeded}` : "",
    summary.failed > 0 ? `failed ${summary.failed}` : "",
    summary.warnings > 0 ? `needs attention ${summary.warnings}` : "",
  ].filter(Boolean);
  return [actionSummary, statusParts.join(" / ")].filter(Boolean).join(" | ");
}

export function estimateToolActivityGroupRows(items: ToolActivitySourceItem[]): number {
  if (items.length === 0) return 0;
  return 3 + Math.min(2, items.length);
}

function actionCounts(records: ToolActivityRecord[]): { action: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.action, (counts.get(record.action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}

function formatToolActivityRecord(record: ToolActivityRecord, width: number): string {
  const detail = record.detail ? ` ${record.detail}` : "";
  return truncateCells(`${record.action} ${record.status}${detail}`, width);
}
