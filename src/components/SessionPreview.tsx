import React from "react";
import { Box, Text } from "ink";
import type { TranscriptRecord } from "../services/session/sessionStorage.js";
import { Byline } from "./design/Byline.js";
import { Divider } from "./design/Divider.js";
import { KeyboardShortcutHint } from "./design/KeyboardShortcutHint.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface SessionPreviewModel {
  title: string;
  summary: string;
  rows: SessionPreviewRow[];
  footer: string;
}

export interface SessionPreviewRow {
  key: string;
  role: string;
  tone: TerminalTone;
  marker: string;
  text: string;
  note: string;
}

export function SessionPreview(props: {
  model: SessionPreviewModel;
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Divider width={Math.max(12, props.width - 2)} title={props.model.title} tone="muted" />
      <Text color="gray">{truncateCells(props.model.summary, Math.max(20, props.width - 4))}</Text>
      {props.model.rows.length === 0 ? (
        <Text color="gray">No transcript preview</Text>
      ) : props.model.rows.map((row) => (
        <Box key={row.key} flexDirection="row">
          <Text color={toneColor(row.marker === ">" ? "brand" : "muted")}>{row.marker} </Text>
          <StatusBadge label={row.role} tone={row.tone} />
          <Text color="gray"> </Text>
          <Text color={toneColor(row.tone)}>{truncateCells(row.text, Math.max(16, props.width - 34))}</Text>
          {row.note ? <Text color="gray">{truncateCells(` ${row.note}`, 18)}</Text> : null}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">
          <Byline>
            <KeyboardShortcutHint shortcut="/resume" action="continue" />
            <Text>{props.model.footer}</Text>
          </Byline>
        </Text>
      </Box>
    </Box>
  );
}

export function sessionPreviewModel(records: TranscriptRecord[], title = "preview", limit = 5): SessionPreviewModel {
  const rows = records.slice(-Math.max(1, limit)).map((record, index, visible) => ({
    key: record.id,
    role: record.role,
    tone: previewToneForRole(record.role),
    marker: index === visible.length - 1 ? ">" : " ",
    text: firstLine(record.text, 120),
    note: record.runId ? `run=${shortId(record.runId)}` : "",
  }));
  const counts = previewRoleCounts(records);
  return {
    title,
    summary: [
      `${records.length} messages`,
      `${counts.user} user`,
      `${counts.assistant} assistant`,
      counts.tool > 0 ? `${counts.tool} tool` : "",
      counts.error > 0 ? `${counts.error} error` : "",
    ].filter(Boolean).join(" | "),
    rows,
    footer: rows.length > 0 ? "latest message is selected" : "empty session",
  };
}

export function previewRoleCounts(records: TranscriptRecord[]): Record<"user" | "assistant" | "tool" | "error" | "other", number> {
  const counts = { user: 0, assistant: 0, tool: 0, error: 0, other: 0 };
  for (const record of records) {
    if (record.role === "user") counts.user += 1;
    else if (record.role === "assistant") counts.assistant += 1;
    else if (record.role === "tool") counts.tool += 1;
    else if (record.role === "error") counts.error += 1;
    else counts.other += 1;
  }
  return counts;
}

function previewToneForRole(role: TranscriptRecord["role"]): TerminalTone {
  if (role === "assistant") return "success";
  if (role === "user") return "brand";
  if (role === "tool") return "warning";
  if (role === "error") return "error";
  return "muted";
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, Math.max(0, max - 3))}...` : line;
}

function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}
