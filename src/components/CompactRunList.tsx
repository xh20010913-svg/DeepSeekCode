import React from "react";
import { Box, Text } from "ink";
import type { RunRecord } from "../state/sqlite.js";
import { firstLine } from "../commands/format.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CompactRunListRow {
  key: string;
  status: string;
  tone: TerminalTone;
  summary: string;
  detail: string;
}

export function CompactRunList(props: { runs: RunRecord[]; limit?: number }): React.ReactElement {
  const rows = compactRunListRows(props.runs, props.limit);
  if (rows.length === 0) return <Text color="gray">none</Text>;
  return (
    <Box flexDirection="column">
      {rows.map((row) => (
        <Box key={row.key} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <StatusBadge label={row.status} tone={row.tone} />
            <Text color="gray">{` ${truncateCells(row.summary, 20)}`}</Text>
          </Box>
          <Text color="gray">{truncateCells(`  ${row.detail}`, 30)}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function compactRunListRows(runs: RunRecord[], limit = 5): CompactRunListRow[] {
  return runs.slice(0, limit).map((run) => ({
    key: run.id,
    status: run.status,
    tone: toneForRunStatus(run.status),
    summary: `${shortId(run.id)} ${run.actionCount}a ${run.artifactCount}f ${run.eventCount}e`,
    detail: [cacheNote(run), firstLine(run.message || "(no message)", 26)].filter(Boolean).join(" | "),
  }));
}

function toneForRunStatus(status: string): TerminalTone {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running" || status === "paused") return "warning";
  return "muted";
}

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 6)}..${id.slice(-2)}`;
}

function cacheNote(run: RunRecord): string {
  const hits = run.cacheHitTokens ?? 0;
  const misses = run.cacheMissTokens ?? 0;
  if (hits === 0 && misses === 0) return "";
  const total = hits + misses;
  return `cache=${total > 0 ? Math.round((hits / total) * 100) : 0}%`;
}
