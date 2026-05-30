import React from "react";
import { Box, Text } from "ink";
import type { RunRecord } from "../state/sqlite.js";
import { Divider } from "./design/Divider.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface ResumeTaskModel {
  title: string;
  summary: string;
  rows: ResumeTaskRow[];
  footer: string;
}

export interface ResumeTaskRow {
  key: string;
  marker: string;
  runId: string;
  status: string;
  tone: TerminalTone;
  message: string;
  detail: string;
  selected: boolean;
}

export interface ResumeTaskOptions {
  selectedRunId?: string;
  visibleCount?: number;
  title?: string;
}

export function ResumeTask(props: {
  model: ResumeTaskModel;
  width: number;
}): React.ReactElement {
  const width = Math.max(44, props.width);
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Divider width={Math.max(12, width - 2)} title={props.model.title} tone="muted" />
      <Text color="gray">{truncateCells(props.model.summary, Math.max(20, width - 4))}</Text>
      <Box flexDirection="column" marginTop={1}>
        {props.model.rows.length === 0 ? (
          <Text color="gray">No resumable local runs</Text>
        ) : props.model.rows.map((row) => (
          <Box key={row.key} flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              <Text color={toneColor(row.selected ? "brand" : "muted")}>{row.marker} </Text>
              <StatusBadge label={row.status} tone={row.tone} />
              <Text color="cyan"> {truncateCells(row.runId, 18)}</Text>
              <Text color="gray"> {truncateCells(row.message, Math.max(16, width - 34))}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text color="gray">{truncateCells(row.detail, Math.max(16, width - 8))}</Text>
            </Box>
          </Box>
        ))}
      </Box>
      <Text color="gray">{truncateCells(props.model.footer, Math.max(20, width - 4))}</Text>
    </Box>
  );
}

export function resumeTaskModel(runs: RunRecord[], options: ResumeTaskOptions = {}): ResumeTaskModel {
  const visibleCount = Math.max(1, options.visibleCount ?? 5);
  const resumable = runs.filter(isResumableRun);
  const selectedIndex = selectedRunIndex(resumable, options.selectedRunId);
  const start = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    resumable.length - visibleCount,
  ));
  const visible = resumable.slice(start, start + visibleCount);
  const hiddenBefore = start;
  const hiddenAfter = Math.max(0, resumable.length - start - visible.length);

  return {
    title: options.title ?? "resume task",
    summary: resumeTaskSummary(runs.length, resumable.length, hiddenBefore, hiddenAfter),
    rows: visible.map((run, index) => resumeTaskRow(run, start + index === selectedIndex)),
    footer: resumable.length > 0
      ? "/attach use <run-id> | /tasks <run-id> | /agents drain <run-id>"
      : "/runs | /agents start <agent> <task>",
  };
}

export function isResumableRun(run: RunRecord): boolean {
  return run.status === "running" || run.status === "paused";
}

function resumeTaskRow(run: RunRecord, selected: boolean): ResumeTaskRow {
  return {
    key: run.id,
    marker: selected ? ">" : " ",
    runId: run.id,
    status: run.status,
    tone: toneForRunStatus(run.status),
    message: firstLine(run.message || "(no message)", 120),
    detail: [
      `${run.actionCount} actions`,
      `${run.artifactCount} artifacts`,
      `${run.eventCount} events`,
      cacheNote(run),
      relativeRunTime(run.updatedAtMs),
    ].filter(Boolean).join(" | "),
    selected,
  };
}

function selectedRunIndex(runs: RunRecord[], selectedRunId?: string): number {
  if (runs.length === 0) return 0;
  const byId = selectedRunId ? runs.findIndex((run) => run.id === selectedRunId) : -1;
  return byId >= 0 ? byId : 0;
}

function resumeTaskSummary(totalRuns: number, resumableRuns: number, hiddenBefore: number, hiddenAfter: number): string {
  const hidden = [
    hiddenBefore > 0 ? `${hiddenBefore} older` : "",
    hiddenAfter > 0 ? `${hiddenAfter} newer` : "",
  ].filter(Boolean).join(" / ");
  const base = `${resumableRuns}/${totalRuns} resumable local runs`;
  return hidden ? `${base} / hidden ${hidden}` : base;
}

function toneForRunStatus(status: string): TerminalTone {
  if (status === "running" || status === "paused") return "warning";
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  return "muted";
}

function cacheNote(run: RunRecord): string {
  const hits = run.cacheHitTokens ?? 0;
  const misses = run.cacheMissTokens ?? 0;
  if (hits === 0 && misses === 0) return "";
  const total = hits + misses;
  return `cache=${total > 0 ? Math.round((hits / total) * 100) : 0}%`;
}

function firstLine(value: string, max: number): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, Math.max(0, max - 3))}...` : line;
}

function relativeRunTime(updatedAtMs: number): string {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
