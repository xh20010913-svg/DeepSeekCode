import React from "react";
import { Box, Text } from "ink";
import type { SessionCompactSummary } from "../services/compact/sessionCompact.js";
import type { TranscriptRecord } from "../services/session/sessionStorage.js";
import { Byline } from "./design/Byline.js";
import { KeyboardShortcutHint } from "./design/KeyboardShortcutHint.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface CompactSummaryModel {
  sessionId: string;
  totalRecords: number;
  summarizedRecords: number;
  tailRecords: number;
  ratio: number;
  summaryLines: string[];
  tailRows: CompactSummaryTailRow[];
  footer: string;
}

export interface CompactSummaryTailRow {
  key: string;
  role: TranscriptRecord["role"];
  tone: TerminalTone;
  text: string;
}

export function CompactSummary(props: {
  model: CompactSummaryModel;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 96;
  const barWidth = Math.max(12, Math.min(32, width - 44));
  return (
    <Pane width={width} title="Compact summary" tone="brand">
      <Box flexDirection="row">
        <Text color="cyan">{truncateCells(props.model.sessionId, Math.max(12, width - 40))}</Text>
        <Text color="gray"> </Text>
        <StatusBadge label={`${props.model.summarizedRecords} summarized`} tone={props.model.summarizedRecords > 0 ? "success" : "muted"} />
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Text color="gray">records </Text>
        <ProgressBar ratio={props.model.ratio} width={barWidth} filledTone="success" showPercent />
        <Text color="gray">
          {` total ${props.model.totalRecords} | tail ${props.model.tailRecords}`}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">summary</Text>
        {props.model.summaryLines.length > 0 ? props.model.summaryLines.map((line, index) => (
          <Text key={`summary-${index}`} color="gray">
            {truncateCells(line, Math.max(20, width - 4))}
          </Text>
        )) : (
          <Text color="gray">not enough transcript records to compact</Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">tail</Text>
        {props.model.tailRows.length > 0 ? props.model.tailRows.map((row) => (
          <Box key={row.key} flexDirection="row">
            <StatusBadge label={row.role} tone={row.tone} />
            <Text color="gray"> </Text>
            <Text color={toneColor(row.tone)}>{truncateCells(row.text, Math.max(16, width - 18))}</Text>
          </Box>
        )) : (
          <Text color="gray">No retained tail messages</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          <Byline>
            <KeyboardShortcutHint shortcut="/resume" action="continue" />
            <KeyboardShortcutHint shortcut="/sessions" action="browse" />
            <Text>{props.model.footer}</Text>
          </Byline>
        </Text>
      </Box>
    </Pane>
  );
}

export function compactSummaryModel(summary: SessionCompactSummary, tailLimit = 6): CompactSummaryModel {
  const total = Math.max(0, summary.totalRecords);
  const summarized = Math.max(0, summary.summarizedRecords);
  return {
    sessionId: summary.sessionId,
    totalRecords: total,
    summarizedRecords: summarized,
    tailRecords: summary.tailRecords.length,
    ratio: total === 0 ? 0 : summarized / total,
    summaryLines: compactSummaryLines(summary.summary),
    tailRows: summary.tailRecords.slice(-Math.max(1, tailLimit)).map((record) => ({
      key: record.id,
      role: record.role,
      tone: compactToneForRole(record.role),
      text: firstLine(record.text, 180),
    })),
    footer: summarized > 0 ? "compact preview is local until used by a future prompt" : "nothing compacted yet",
  };
}

export function compactSummaryLines(value: string, limit = 5): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, Math.max(1, limit));
}

function compactToneForRole(role: TranscriptRecord["role"]): TerminalTone {
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
