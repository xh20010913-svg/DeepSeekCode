import React from "react";
import { Box, Text } from "ink";
import type { TranscriptRecord } from "../services/session/sessionStorage.js";
import { Divider } from "./design/Divider.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface MessageSelectorModel {
  title: string;
  summary: string;
  rows: MessageSelectorRow[];
  footer: string;
}

export interface MessageSelectorRow {
  key: string;
  marker: string;
  label: string;
  tone: TerminalTone;
  text: string;
  note: string;
  selected: boolean;
}

export interface MessageSelectorOptions {
  selectedId?: string;
  visibleCount?: number;
  title?: string;
}

export function MessageSelector(props: {
  model: MessageSelectorModel;
  width: number;
}): React.ReactElement {
  const width = Math.max(42, props.width);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Divider width={Math.max(12, width - 2)} title={props.model.title} tone="muted" />
      <Text color="gray">{truncateCells(props.model.summary, Math.max(20, width - 4))}</Text>
      {props.model.rows.length === 0 ? (
        <Text color="gray">No user messages to select</Text>
      ) : props.model.rows.map((row) => (
        <Box key={row.key} flexDirection="row">
          <Text color={toneColor(row.selected ? "brand" : "muted")}>{row.marker} </Text>
          <StatusBadge label={row.label} tone={row.tone} />
          <Text color="gray"> </Text>
          <Text color={toneColor(row.tone)}>{truncateCells(row.text, Math.max(16, width - 36))}</Text>
          {row.note ? <Text color="gray">{truncateCells(` ${row.note}`, 22)}</Text> : null}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(20, width - 4))}</Text>
      </Box>
    </Box>
  );
}

export function messageSelectorModel(
  records: TranscriptRecord[],
  options: MessageSelectorOptions = {},
): MessageSelectorModel {
  const visibleCount = Math.max(1, options.visibleCount ?? 7);
  const selectable = records.filter(isSelectableUserRecord);
  const selectedIndex = selectedMessageIndex(selectable, options.selectedId);
  const start = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    selectable.length - visibleCount,
  ));
  const visible = selectable.slice(start, start + visibleCount);
  const hiddenBefore = start;
  const hiddenAfter = Math.max(0, selectable.length - start - visible.length);
  return {
    title: options.title ?? "message selector",
    summary: messageSelectorSummary(selectable.length, hiddenBefore, hiddenAfter),
    rows: visible.map((record) => selectorRow(record, records, record.id === selectable[selectedIndex]?.id)),
    footer: selectable.length > 0
      ? "planned: choose a user turn for rewind or summarization"
      : "send a user prompt before message-level restore is useful",
  };
}

export function isSelectableUserRecord(record: TranscriptRecord): boolean {
  return record.role === "user" && record.text.trim().length > 0;
}

function selectedMessageIndex(records: TranscriptRecord[], selectedId?: string): number {
  if (records.length === 0) return 0;
  const byId = selectedId ? records.findIndex((record) => record.id === selectedId) : -1;
  return byId >= 0 ? byId : records.length - 1;
}

function selectorRow(record: TranscriptRecord, allRecords: TranscriptRecord[], selected: boolean): MessageSelectorRow {
  const transcriptIndex = allRecords.findIndex((entry) => entry.id === record.id);
  const messagesAfter = transcriptIndex >= 0 ? allRecords.length - transcriptIndex - 1 : 0;
  return {
    key: record.id,
    marker: selected ? ">" : " ",
    label: selected ? "target" : "user",
    tone: selected ? "brand" : "muted",
    text: firstLine(record.text, 120),
    note: [
      messagesAfter > 0 ? `+${messagesAfter} after` : "latest",
      relativeRecordTime(record.createdAtMs),
    ].filter(Boolean).join(" | "),
    selected,
  };
}

function messageSelectorSummary(total: number, hiddenBefore: number, hiddenAfter: number): string {
  if (total === 0) return "0 selectable user messages";
  const hidden = [
    hiddenBefore > 0 ? `${hiddenBefore} older` : "",
    hiddenAfter > 0 ? `${hiddenAfter} newer` : "",
  ].filter(Boolean).join(" / ");
  return hidden
    ? `${total} selectable user messages / hidden ${hidden}`
    : `${total} selectable user message${total === 1 ? "" : "s"}`;
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, Math.max(0, max - 3))}...` : line;
}

function relativeRecordTime(createdAtMs: number): string {
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
