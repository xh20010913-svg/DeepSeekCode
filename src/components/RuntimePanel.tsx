import React from "react";
import { Box, Text } from "ink";
import type { LogRecord } from "../utils/log.js";
import type { EventRecord } from "../state/sqlite.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { LogSelector, logSelectorModel, type LogSelectorModel } from "./LogSelector.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface RuntimePanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  selector?: LogSelectorModel;
  rows: RuntimePanelRow[];
  footer: string;
}

export interface RuntimePanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  title: string;
  detail: string;
  meta?: string;
}

export interface RuntimeTraceModelInput {
  run?: Record<string, unknown> | null;
  tasks?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  events?: EventRecord[];
}

const TRACE_TASK_LIMIT = 8;
const TRACE_ACTION_LIMIT = 8;
const TRACE_ARTIFACT_LIMIT = 6;
const TRACE_EVENT_LIMIT = 8;

export function RuntimePanel(props: {
  model: RuntimePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(56, Math.min(116, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="runtime" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        {props.model.selector ? (
          <LogSelector model={props.model.selector} width={width} />
        ) : null}
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No runtime records</Text>
          ) : props.model.rows.map((row) => (
            <RuntimePanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function runtimeLogsPanelModel(rows: LogRecord[]): RuntimePanelModel {
  const errorCount = rows.filter((row) => row.level === "error").length;
  const warningCount = rows.filter((row) => row.level === "warn").length;
  return {
    title: "Runtime logs",
    subtitle: `${rows.length} recent log${rows.length === 1 ? "" : "s"} | errors=${errorCount} warnings=${warningCount}`,
    badge: errorCount > 0 ? "errors" : warningCount > 0 ? "warnings" : "logs",
    badgeTone: errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "brand",
    selector: logSelectorModel(rows, { title: "runtime log selector" }),
    rows: rows.map((row, index) => ({
      key: `${row.createdAtMs}-${index}`,
      label: row.level,
      tone: toneForLogLevel(row.level),
      title: row.message,
      detail: row.metadata === undefined ? "" : safeJson(row.metadata),
      meta: formatTime(row.createdAtMs),
    })),
    footer: "/doctor diagnostics | /trace <run-id|attached> | /events all",
  };
}

export function runtimeEventsPanelModel(rows: EventRecord[], scope: string): RuntimePanelModel {
  const runScoped = rows.filter((row) => row.runId).length;
  return {
    title: "Runtime events",
    subtitle: `${rows.length} event${rows.length === 1 ? "" : "s"} | scope=${scope} | run-linked=${runScoped}`,
    badge: `${rows.length}`,
    badgeTone: rows.length > 0 ? "brand" : "muted",
    rows: rows.map((row) => ({
      key: String(row.id),
      label: row.kind,
      tone: toneForEventKind(row.kind),
      title: `#${row.id} ${row.runId ?? "global"}`,
      detail: safeJson(row.payload),
      meta: formatTime(row.createdAtMs),
    })),
    footer: "/events <run-id|attached|all> | /trace <run-id|attached>",
  };
}

export function runtimeTracePanelModel(runId: string, trace: RuntimeTraceModelInput): RuntimePanelModel {
  const tasks = trace.tasks ?? [];
  const actions = trace.actions ?? [];
  const artifacts = trace.artifacts ?? [];
  const events = trace.events ?? [];
  const rows: RuntimePanelRow[] = [];
  const run = trace.run;

  if (run) {
    const status = textField(run, "status", "run");
    rows.push({
      key: "run",
      label: status,
      tone: toneForStatus(status),
      title: textField(run, "id", runId),
      detail: [textField(run, "model", ""), textField(run, "message", "")].filter(Boolean).join(" | "),
      meta: timeField(run, "updatedAtMs") || timeField(run, "updated_at_ms"),
    });
  }

  rows.push(...tasks.slice(0, TRACE_TASK_LIMIT).map((task, index) => {
    const status = textField(task, "status", "task");
    return {
      key: `task-${textField(task, "id", index)}`,
      label: status,
      tone: toneForStatus(status),
      title: `task ${textField(task, "id", String(index + 1))}`,
      detail: [textField(task, "agent", ""), textField(task, "title", ""), textField(task, "detail", "")].filter(Boolean).join(" | "),
      meta: timeField(task, "updatedAtMs") || timeField(task, "updated_at_ms"),
    };
  }));

  rows.push(...actions.slice(0, TRACE_ACTION_LIMIT).map((action, index) => {
    const status = textField(action, "status", "action");
    return {
      key: `action-${textField(action, "step_index", index)}`,
      label: status,
      tone: toneForStatus(status),
      title: `action ${textField(action, "step_index", String(index + 1))}`,
      detail: [
        textField(action, "action_type", ""),
        textField(action, "path", ""),
        textField(action, "message", ""),
      ].filter(Boolean).join(" | "),
      meta: timeField(action, "created_at_ms"),
    };
  }));

  rows.push(...artifacts.slice(0, TRACE_ARTIFACT_LIMIT).map((artifact, index) => ({
    key: `artifact-${textField(artifact, "path", index)}`,
    label: "artifact",
    tone: "brand" as TerminalTone,
    title: textField(artifact, "kind", "artifact"),
    detail: textField(artifact, "path", "(no path)"),
    meta: timeField(artifact, "created_at_ms"),
  })));

  rows.push(...events.slice(0, TRACE_EVENT_LIMIT).map((event) => ({
    key: `event-${event.id}`,
    label: event.kind,
    tone: toneForEventKind(event.kind),
    title: `event #${event.id}`,
    detail: safeJson(event.payload),
    meta: formatTime(event.createdAtMs),
  })));

  const clipped = [
    clippedNote("tasks", tasks.length, TRACE_TASK_LIMIT),
    clippedNote("actions", actions.length, TRACE_ACTION_LIMIT),
    clippedNote("artifacts", artifacts.length, TRACE_ARTIFACT_LIMIT),
    clippedNote("events", events.length, TRACE_EVENT_LIMIT),
  ].filter(Boolean).join(" ");

  return {
    title: "Run trace",
    subtitle: `${runId} | tasks=${tasks.length} actions=${actions.length} artifacts=${artifacts.length} events=${events.length}`,
    badge: run ? textField(run, "status", "trace") : "missing",
    badgeTone: run ? toneForStatus(textField(run, "status", "")) : "warning",
    rows,
    footer: clipped || "/events <run-id|attached> | /export run <run-id>",
  };
}

function RuntimePanelRowView(props: {
  row: RuntimePanelRow;
  width: number;
}): React.ReactElement {
  const titleWidth = Math.max(16, Math.min(30, Math.floor(props.width * 0.28)));
  const detailWidth = Math.max(24, props.width - titleWidth - 18);
  const metaWidth = Math.max(24, props.width - 10);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={truncateCells(props.row.label, 14)} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.title.padEnd(titleWidth), titleWidth)}</Text>
        <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
      </Box>
      {props.row.meta ? (
        <Box flexDirection="row">
          <Text color="gray">  </Text>
          <Text color="gray">{truncateCells(props.row.meta, metaWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function toneForLogLevel(level: string): TerminalTone {
  if (level === "error") return "error";
  if (level === "warn") return "warning";
  if (level === "info") return "brand";
  return "muted";
}

function toneForEventKind(kind: string): TerminalTone {
  if (/fail|error|reject|deny|cancel/i.test(kind)) return "error";
  if (/approval|gate|pause|validation|warn/i.test(kind)) return "warning";
  if (/complete|success|succeeded|attached|created/i.test(kind)) return "success";
  return "brand";
}

function toneForStatus(status: string): TerminalTone {
  if (/success|succeeded|complete|passed|done|ok/i.test(status)) return "success";
  if (/fail|error|rejected|cancel/i.test(status)) return "error";
  if (/run|queue|pending|paused|approval|warn/i.test(status)) return "warning";
  return "muted";
}

function textField(record: Record<string, unknown>, key: string, fallback: unknown): string {
  const value = record[key];
  if (value === undefined || value === null || value === "") return String(fallback);
  return String(value);
}

function timeField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "number") return "";
  return formatTime(value);
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function clippedNote(name: string, total: number, shown: number): string {
  if (total <= shown) return "";
  return `${name} clipped ${shown}/${total}`;
}

function safeJson(value: unknown): string {
  try {
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    return rendered ?? "";
  } catch {
    return String(value);
  }
}
