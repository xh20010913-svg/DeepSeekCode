import React from "react";
import { Box, Text } from "ink";
import type { LogLevel, LogRecord } from "../utils/log.js";
import { Divider } from "./design/Divider.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface LogSelectorModel {
  title: string;
  summary: string;
  levels: LogSelectorLevelCount[];
  rows: LogSelectorRow[];
  footer: string;
}

export interface LogSelectorLevelCount {
  level: LogLevel;
  count: number;
  tone: TerminalTone;
}

export interface LogSelectorRow {
  key: string;
  marker: string;
  level: LogLevel;
  tone: TerminalTone;
  message: string;
  meta: string;
  selected: boolean;
}

export interface LogSelectorOptions {
  query?: string;
  selectedIndex?: number;
  visibleCount?: number;
  title?: string;
}

export function LogSelector(props: {
  model: LogSelectorModel;
  width: number;
}): React.ReactElement {
  const width = Math.max(44, props.width);
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Divider width={Math.max(12, width - 2)} title={props.model.title} tone="muted" />
      <Text color="gray">{truncateCells(props.model.summary, Math.max(20, width - 4))}</Text>
      <Box flexDirection="row" marginTop={1}>
        {props.model.levels.map((level) => (
          <Box key={level.level} marginRight={1}>
            <StatusBadge label={`${level.level} ${level.count}`} tone={level.count > 0 ? level.tone : "muted"} />
          </Box>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {props.model.rows.length === 0 ? (
          <Text color="gray">No matching logs</Text>
        ) : props.model.rows.map((row) => (
          <Box key={row.key} flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              <Text color={toneColor(row.selected ? "brand" : "muted")}>{row.marker} </Text>
              <StatusBadge label={row.level} tone={row.tone} />
              <Text color="gray"> </Text>
              <Text color={toneColor(row.tone)}>{truncateCells(row.message, Math.max(16, width - 20))}</Text>
            </Box>
            {row.meta ? (
              <Box marginLeft={2}>
                <Text color="gray">{truncateCells(row.meta, Math.max(16, width - 8))}</Text>
              </Box>
            ) : null}
          </Box>
        ))}
      </Box>
      <Text color="gray">{truncateCells(props.model.footer, Math.max(20, width - 4))}</Text>
    </Box>
  );
}

export function logSelectorModel(logs: LogRecord[], options: LogSelectorOptions = {}): LogSelectorModel {
  const query = options.query?.trim().toLowerCase() ?? "";
  const visibleCount = Math.max(1, options.visibleCount ?? 6);
  const filtered = query ? logs.filter((record) => logMatches(record, query)) : logs;
  const selectedIndex = selectedLogIndex(filtered, options.selectedIndex);
  const start = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    filtered.length - visibleCount,
  ));
  const visible = filtered.slice(start, start + visibleCount);
  const hiddenBefore = start;
  const hiddenAfter = Math.max(0, filtered.length - start - visible.length);

  return {
    title: options.title ?? "log selector",
    summary: logSelectorSummary(logs.length, filtered.length, hiddenBefore, hiddenAfter, query),
    levels: logSelectorLevelCounts(logs),
    rows: visible.map((record, index) => logSelectorRow(record, start + index, start + index === selectedIndex)),
    footer: query ? "/logs [limit] clears the filter" : "/doctor diagnostics | /trace <run-id|attached>",
  };
}

export function logSelectorLevelCounts(logs: LogRecord[]): LogSelectorLevelCount[] {
  const counts: Record<LogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  };
  for (const log of logs) counts[log.level] += 1;
  return (["error", "warn", "info", "debug"] as LogLevel[]).map((level) => ({
    level,
    count: counts[level],
    tone: toneForLogLevel(level),
  }));
}

function logSelectorRow(record: LogRecord, index: number, selected: boolean): LogSelectorRow {
  return {
    key: `${record.createdAtMs}-${index}`,
    marker: selected ? ">" : " ",
    level: record.level,
    tone: toneForLogLevel(record.level),
    message: firstLine(record.message, 160),
    meta: formatLogMeta(record),
    selected,
  };
}

function selectedLogIndex(logs: LogRecord[], selectedIndex?: number): number {
  if (logs.length === 0) return 0;
  if (selectedIndex !== undefined) return Math.max(0, Math.min(logs.length - 1, selectedIndex));
  const important = findLastIndex(logs, (record) => record.level === "error" || record.level === "warn");
  return important >= 0 ? important : logs.length - 1;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function logMatches(record: LogRecord, query: string): boolean {
  return [
    record.level,
    record.message,
    formatLogMeta(record),
  ].some((value) => value.toLowerCase().includes(query));
}

function logSelectorSummary(
  total: number,
  filtered: number,
  hiddenBefore: number,
  hiddenAfter: number,
  query: string,
): string {
  const filter = query ? ` / query="${query}"` : "";
  const hidden = [
    hiddenBefore > 0 ? `${hiddenBefore} older` : "",
    hiddenAfter > 0 ? `${hiddenAfter} newer` : "",
  ].filter(Boolean).join(" / ");
  return hidden
    ? `${filtered}/${total} logs${filter} / hidden ${hidden}`
    : `${filtered}/${total} logs${filter}`;
}

function formatLogMeta(record: LogRecord): string {
  const parts = [formatTime(record.createdAtMs)];
  if (record.metadata !== undefined) parts.push(safeJson(record.metadata));
  return parts.filter(Boolean).join(" | ");
}

function toneForLogLevel(level: LogLevel): TerminalTone {
  if (level === "error") return "error";
  if (level === "warn") return "warning";
  if (level === "info") return "brand";
  return "muted";
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, Math.max(0, max - 3))}...` : line;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function safeJson(value: unknown): string {
  try {
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    return rendered ?? "";
  } catch {
    return String(value);
  }
}
