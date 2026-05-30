import React from "react";
import { Box, Text } from "ink";
import { cacheRate } from "../query/promptCache.js";
import type { CacheDoctorReport } from "../services/cache/cacheDoctor.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CacheDoctorPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  summary: string;
  rows: CacheDoctorPanelRow[];
  footer: string;
}

export interface CacheDoctorPanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  detail: string;
}

export function CacheDoctorPanel(props: {
  model: CacheDoctorPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(112, columns - 4));
  const nameWidth = Math.max(14, Math.min(28, Math.floor(width * 0.28)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache doctor" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{truncateCells(props.model.summary, Math.max(24, width - 4))}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <Box key={row.key} flexDirection="row">
              <StatusBadge label={row.label} tone={row.tone} />
              <Text> {truncateCells(row.name.padEnd(nameWidth), nameWidth)} </Text>
              <Text color="gray">{truncateCells(row.detail, Math.max(12, width - nameWidth - 14))}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
        </Box>
      </Pane>
    </Box>
  );
}

export function buildCacheDoctorPanelModel(report: CacheDoctorReport): CacheDoctorPanelModel {
  const lowCacheRuns = report.runs.filter((run) => {
    const total = run.cacheHitTokens + run.cacheMissTokens;
    return total > 0 && run.cacheHitTokens / total < 0.6;
  });
  const rows: CacheDoctorPanelRow[] = [
    {
      key: "usage",
      label: "use",
      tone: report.usage.snapshots > 0 ? "success" : "muted",
      name: "token usage",
      detail: `snapshots=${report.usage.snapshots} input=${report.usage.inputTokens} output=${report.usage.outputTokens} cache=${cacheRate(report.usage.cacheHitTokens, report.usage.cacheMissTokens)}`,
    },
    {
      key: "prefix",
      label: "pre",
      tone: report.prefixDriftEvents > 0 ? "warning" : "success",
      name: "stable prefix",
      detail: `stable=${report.prefixStableEvents} drift=${report.prefixDriftEvents}`,
    },
    {
      key: "plans",
      label: "plan",
      tone: report.highDynamicPlans > 0 || report.droppedChars > 0 ? "warning" : "success",
      name: "prompt plans",
      detail: `plans=${report.promptPlans} highDynamic=${report.highDynamicPlans} droppedChars=${report.droppedChars}`,
    },
    {
      key: "guards",
      label: "guard",
      tone: report.guardBlock > 0 ? "error" : report.guardPrepare > 0 ? "warning" : report.guardEvents > 0 ? "success" : "muted",
      name: "runtime guard",
      detail: `events=${report.guardEvents} run=${report.guardRun} prepare=${report.guardPrepare} block=${report.guardBlock}`,
    },
    ...report.guardRows.filter((row) => row.decision !== "run").slice(0, 5).map((row) => ({
      key: `guard:${row.runId}`,
      label: row.decision === "block" ? "block" : "prep",
      tone: row.decision === "block" ? "error" as const : "warning" as const,
      name: row.runId,
      detail: `profile=${row.profile} hit=${Math.round(row.estimatedHitRate * 100)}% warnings=${row.warnings.length} blockers=${row.blockers.length} ${row.message}`,
    })),
    ...lowCacheRuns.slice(0, 6).map((run) => ({
      key: `run:${run.id}`,
      label: "low",
      tone: "warning" as const,
      name: run.id,
      detail: `${run.cacheRate} hit=${run.cacheHitTokens} miss=${run.cacheMissTokens} ${run.status} ${run.message}`,
    })),
    ...report.recommendations.slice(0, 5).map((recommendation, index) => ({
      key: `rec:${index}`,
      label: "rec",
      tone: recommendationTone(recommendation),
      name: `recommend ${index + 1}`,
      detail: recommendation,
    })),
  ];
  return {
    title: "DeepSeek cache doctor",
    subtitle: `scope: ${report.scope}`,
    badge: badgeFor(report, lowCacheRuns.length),
    badgeTone: badgeToneFor(report, lowCacheRuns.length),
    summary: `runs=${report.observedRuns} cache=${cacheRate(report.usage.cacheHitTokens, report.usage.cacheMissTokens)} guards=${report.guardEvents} prepare=${report.guardPrepare} block=${report.guardBlock}`,
    rows,
    footer: "/cache guard <goal> | /cache prepare <goal> | /cache pin audit | /usage",
  };
}

function badgeFor(report: CacheDoctorReport, lowCacheRunCount: number): string {
  if (report.usage.snapshots === 0) return "empty";
  if (report.guardBlock > 0) return "blocked";
  if (report.prefixDriftEvents > 0 || report.highDynamicPlans > 0 || report.droppedChars > 0 || lowCacheRunCount > 0 || report.guardPrepare > 0) {
    return "review";
  }
  return "healthy";
}

function badgeToneFor(report: CacheDoctorReport, lowCacheRunCount: number): TerminalTone {
  if (report.usage.snapshots === 0) return "muted";
  if (report.guardBlock > 0) return "error";
  return badgeFor(report, lowCacheRunCount) === "healthy" ? "success" : "warning";
}

function recommendationTone(recommendation: string): TerminalTone {
  return /healthy|looks healthy/i.test(recommendation) ? "success" : "brand";
}
