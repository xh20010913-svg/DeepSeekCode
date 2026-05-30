import React from "react";
import { Box, Text } from "ink";
import type { RunRecord, TaskRecord } from "../state/sqlite.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { Tabs, type TabItem } from "./design/Tabs.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { ResumeTask, resumeTaskModel, type ResumeTaskModel } from "./ResumeTask.js";

export interface RunPanelModel {
  title: string;
  subtitle: string;
  rows: RunPanelRow[];
  summary: RunPanelSummary;
  resumeTask?: ResumeTaskModel;
  footer: string;
}

export interface RunPanelSummary {
  label: string;
  ratio: number;
  tone: TerminalTone;
  detail: string;
  badges: RunPanelBadge[];
}

export interface RunPanelBadge {
  label: string;
  tone: TerminalTone;
}

export interface RunPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function RunPanel(props: {
  model: RunPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="runs" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.summary.label} tone={props.model.summary.tone} />
        </Box>
        <Box marginTop={1}>
          <Tabs selectedId="records" title="view" tabs={runPanelTabs(props.model)} width={width} />
        </Box>
        <RunSummaryBlock summary={props.model.summary} width={width} />
        {props.model.resumeTask ? (
          <ResumeTask model={props.model.resumeTask} width={width} />
        ) : null}
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">records</Text>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No run or task records</Text>
          ) : (
            <SelectList options={runPanelRowOptions(props.model)} selectedIndex={0} visibleCount={6} width={width} />
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">commands</Text>
        </Box>
        <SelectList options={runPanelCommandOptions(props.model)} selectedIndex={0} visibleCount={4} width={width} />
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function runsPanelModel(runs: RunRecord[]): RunPanelModel {
  return {
    title: "Runs",
    subtitle: `${runs.length} recent run${runs.length === 1 ? "" : "s"}`,
    rows: runs.map((run) => ({
      key: run.id,
      name: run.id,
      status: run.status,
      tone: toneForStatus(run.status),
      detail: run.message || "(no message)",
      note: [
        `actions=${run.actionCount}`,
        `artifacts=${run.artifactCount}`,
        `events=${run.eventCount}`,
        cacheNote(run),
      ].filter(Boolean).join(" "),
    })),
    summary: runSummary(runs),
    resumeTask: resumeTaskModel(runs, { title: "resume local run" }),
    footer: "/tasks <run-id|attached> | /queue <run-id|attached> | /attach use <run-id>",
  };
}

export function tasksPanelModel(runId: string, tasks: TaskRecord[]): RunPanelModel {
  return {
    title: "Tasks",
    subtitle: runId,
    rows: tasks.map((task) => taskRow(task, task.status)),
    summary: taskSummaryModel(tasks),
    footer: "/queue <run-id|attached> | /agents step <run-id|attached>",
  };
}

export function queuePanelModel(input: {
  runId: string;
  tasks: TaskRecord[];
  runnableIds: Set<string>;
  dependenciesByTaskId: Map<string, string[]>;
}): RunPanelModel {
  return {
    title: "Queue",
    subtitle: input.runId,
    rows: input.tasks.map((task) => {
      const state = input.runnableIds.has(task.id) ? "runnable" : task.status;
      const deps = input.dependenciesByTaskId.get(task.id) ?? [];
      return taskRow(task, state, deps.length ? `deps=${deps.join(",")}` : "");
    }),
    summary: taskSummaryModel(input.tasks, input.runnableIds, input.dependenciesByTaskId),
    footer: "/agents step <run-id|attached> | /pause <run-id> | /resume <run-id>",
  };
}

export function runControlPanelModel(input: {
  run?: RunRecord;
  runId: string;
  action: "paused" | "resumed" | "cancelled";
  reason: string;
}): RunPanelModel {
  return {
    title: "Run control",
    subtitle: `${input.runId} ${input.action}`,
    rows: input.run ? [{
      key: input.run.id,
      name: input.run.id,
      status: input.run.status,
      tone: toneForStatus(input.run.status),
      detail: input.run.message || input.reason,
      note: [
        `actions=${input.run.actionCount}`,
        `artifacts=${input.run.artifactCount}`,
        `events=${input.run.eventCount}`,
        input.reason ? `reason=${input.reason}` : "",
      ].filter(Boolean).join(" "),
    }] : [{
      key: input.runId,
      name: input.runId,
      status: "missing",
      tone: "warning",
      detail: "run not found in local state",
      note: input.reason,
    }],
    summary: runSummary(input.run ? [input.run] : []),
    footer: "/runs | /tasks <run-id> | /trace <run-id>",
  };
}

export function runPanelTabs(model: RunPanelModel): TabItem[] {
  return [
    { id: "records", title: "records", count: model.rows.length, tone: model.rows.length > 0 ? "brand" : "muted" },
    { id: "summary", title: "summary", count: model.summary.badges.length, tone: model.summary.tone },
    { id: "commands", title: "commands", count: runPanelCommandOptions(model).length, tone: "muted" },
  ];
}

export function runPanelRowOptions(model: RunPanelModel): SelectListOption[] {
  return model.rows.map((row, index) => ({
    id: row.key,
    label: row.name,
    detail: `${row.status} | ${row.detail}`,
    description: row.note,
    selected: index === 0,
    tone: row.tone,
  }));
}

export function runPanelCommandOptions(model: RunPanelModel): SelectListOption[] {
  const lowerTitle = model.title.toLowerCase();
  if (lowerTitle.includes("queue")) {
    return [
      commandOption("step", "/agents step <run-id|attached>", "claim the next runnable task", "brand"),
      commandOption("drain", "/agents drain <run-id|attached>", "run several queued tasks with bounded steps", "success"),
      commandOption("pause", "/pause <run-id>", "pause this run before more task work", "warning"),
      commandOption("tasks", "/tasks <run-id|attached>", "open the task list for this run", "muted"),
    ];
  }
  if (lowerTitle.includes("task")) {
    return [
      commandOption("queue", "/queue <run-id|attached>", "show runnable and blocked task state", "brand"),
      commandOption("step", "/agents step <run-id|attached>", "execute the next agent task", "success"),
      commandOption("drain", "/agents drain <run-id|attached>", "continue until idle or max steps", "warning"),
      commandOption("attach", "/attach use <run-id>", "focus this run in the TUI", "muted"),
    ];
  }
  if (lowerTitle.includes("control")) {
    return [
      commandOption("trace", "/trace <run-id>", "inspect actions, artifacts, and events", "brand"),
      commandOption("tasks", "/tasks <run-id>", "inspect tasks for this run", "success"),
      commandOption("runs", "/runs", "return to recent runs", "muted"),
    ];
  }
  return [
    commandOption("tasks", "/tasks <run-id|attached>", "inspect tasks for a selected run", "brand"),
    commandOption("queue", "/queue <run-id|attached>", "show runnable and blocked task state", "success"),
    commandOption("attach", "/attach use <run-id>", "focus this run in the TUI", "warning"),
    commandOption("trace", "/trace <run-id>", "open run execution detail", "muted"),
  ];
}

function RunSummaryBlock(props: {
  summary: RunPanelSummary;
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        {props.summary.badges.length > 0 ? props.summary.badges.slice(0, 5).map((badge) => (
          <React.Fragment key={badge.label}>
            <StatusBadge label={badge.label} tone={badge.tone} />
            <Text> </Text>
          </React.Fragment>
        )) : (
          <StatusBadge label="empty" tone="muted" />
        )}
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Text color="gray">{truncateCells(props.summary.label.padEnd(18), 18)}</Text>
        <ProgressBar ratio={props.summary.ratio} width={Math.max(12, Math.min(32, props.width - 38))} filledTone={props.summary.tone} showPercent />
      </Box>
      <Text color="gray">{truncateCells(props.summary.detail, Math.max(24, props.width - 4))}</Text>
    </Box>
  );
}

function commandOption(id: string, detail: string, description: string, tone: TerminalTone): SelectListOption {
  return {
    id,
    label: id,
    detail,
    description,
    tone,
  };
}

function runSummary(runs: RunRecord[]): RunPanelSummary {
  const counts = countBy(runs.map((run) => run.status));
  const done = runs.filter((run) => isTerminalStatus(run.status)).length;
  const total = runs.length;
  const actions = sum(runs.map((run) => run.actionCount));
  const artifacts = sum(runs.map((run) => run.artifactCount));
  const events = sum(runs.map((run) => run.eventCount));
  const cacheHits = sum(runs.map((run) => run.cacheHitTokens ?? 0));
  const cacheMisses = sum(runs.map((run) => run.cacheMissTokens ?? 0));
  const cacheTotal = cacheHits + cacheMisses;
  const cacheText = cacheTotal > 0 ? `cache=${Math.round((cacheHits / cacheTotal) * 100)}%` : "cache=n/a";
  return {
    label: total === 0 ? "0 runs" : `${done}/${total} done`,
    ratio: total === 0 ? 0 : done / total,
    tone: summaryTone(counts),
    detail: `actions=${actions} artifacts=${artifacts} events=${events} ${cacheText}`,
    badges: badgesFromCounts(counts),
  };
}

function taskSummaryModel(
  tasks: TaskRecord[],
  runnableIds = new Set<string>(),
  dependenciesByTaskId = new Map<string, string[]>(),
): RunPanelSummary {
  const states = tasks.map((task) => runnableIds.has(task.id) ? "runnable" : task.status);
  const counts = countBy(states);
  const done = tasks.filter((task) => isTerminalStatus(task.status)).length;
  const blocked = tasks.filter((task) => (dependenciesByTaskId.get(task.id) ?? []).length > 0).length;
  const running = tasks.filter((task) => task.status === "running").length;
  return {
    label: tasks.length === 0 ? "0 tasks" : `${done}/${tasks.length} done`,
    ratio: tasks.length === 0 ? 0 : done / tasks.length,
    tone: summaryTone(counts),
    detail: `running=${running} runnable=${runnableIds.size} blocked=${blocked}`,
    badges: badgesFromCounts(counts),
  };
}

function taskRow(task: TaskRecord, status: string, extraNote = ""): RunPanelRow {
  return {
    key: task.id,
    name: task.id,
    status,
    tone: toneForStatus(status),
    detail: `${task.agent}: ${task.title}`,
    note: [task.detail, extraNote].filter(Boolean).join(" "),
  };
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function badgesFromCounts(counts: Map<string, number>): RunPanelBadge[] {
  return [...counts.entries()]
    .sort(([left], [right]) => statusRank(left) - statusRank(right) || left.localeCompare(right))
    .map(([status, count]) => ({
      label: `${status} ${count}`,
      tone: toneForStatus(status),
    }));
}

function summaryTone(counts: Map<string, number>): TerminalTone {
  if ([...counts.keys()].some((status) => toneForStatus(status) === "error")) return "error";
  if ((counts.get("running") ?? 0) > 0 || (counts.get("queued") ?? 0) > 0 || (counts.get("paused") ?? 0) > 0) return "warning";
  if ((counts.get("runnable") ?? 0) > 0 || (counts.get("succeeded") ?? 0) > 0) return "success";
  return "muted";
}

function statusRank(status: string): number {
  if (status === "failed" || status === "cancelled") return 0;
  if (status === "running") return 1;
  if (status === "runnable") return 2;
  if (status === "queued" || status === "paused") return 3;
  if (status === "succeeded") return 4;
  return 5;
}

function isTerminalStatus(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toneForStatus(status: string): TerminalTone {
  if (status === "succeeded" || status === "runnable") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running" || status === "queued" || status === "paused") return "warning";
  return "muted";
}

function cacheNote(run: RunRecord): string {
  const hits = run.cacheHitTokens ?? 0;
  const misses = run.cacheMissTokens ?? 0;
  if (hits === 0 && misses === 0) return "";
  const total = hits + misses;
  const rate = total > 0 ? Math.round((hits / total) * 100) : 0;
  return `cache=${rate}%`;
}
