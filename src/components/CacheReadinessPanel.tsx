import React from "react";
import { Box, Text } from "ink";
import type { CacheReadinessReport, CacheReadinessStatus } from "../services/cache/cacheReadiness.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CacheReadinessPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  ratio: number;
  summary: string;
  rows: CacheReadinessPanelRow[];
  footer: string;
}

export interface CacheReadinessPanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  detail: string;
}

export function CacheReadinessPanel(props: {
  model: CacheReadinessPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(112, columns - 4));
  const nameWidth = Math.max(14, Math.min(28, Math.floor(width * 0.28)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache readiness" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <StatusBadge label="score" tone={props.model.badgeTone} />
          <Text> </Text>
          <ProgressBar ratio={props.model.ratio} width={Math.max(12, Math.min(28, width - 48))} showPercent />
          <Text color="gray"> {truncateCells(props.model.summary, Math.max(16, width - 46))}</Text>
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

export function buildCacheReadinessPanelModel(report: CacheReadinessReport): CacheReadinessPanelModel {
  const rows: CacheReadinessPanelRow[] = [
    {
      key: "telemetry",
      label: "hit",
      tone: report.telemetry.hitTokens + report.telemetry.missTokens > 0 ? toneForRate(report.telemetry.rate) : "muted",
      name: "telemetry",
      detail: `rate=${report.telemetry.rate} hit=${report.telemetry.hitTokens} miss=${report.telemetry.missTokens} runs=${report.telemetry.observedRuns}`,
    },
    {
      key: "pins",
      label: "pin",
      tone: toneForSeverity(report.pinSeverity),
      name: "stable pins",
      detail: `count=${report.pinCount} chars=${report.totalPinChars} issues=${report.pinIssues}`,
    },
    {
      key: "shapes",
      label: "shape",
      tone: report.riskyShapes > 0 ? "warning" : report.totalShapes > 0 ? "success" : "muted",
      name: "prompt shapes",
      detail: `count=${report.totalShapes} repeated=${report.repeatedShapes} risky=${report.riskyShapes}${report.latestShape ? ` latest=${report.latestShape}` : ""}`,
    },
    ...report.recommendations.slice(0, 5).map((recommendation, index) => ({
      key: `rec:${index}`,
      label: "next",
      tone: recommendationTone(recommendation),
      name: `step ${index + 1}`,
      detail: recommendation,
    })),
  ];
  return {
    title: "DeepSeek cache readiness",
    subtitle: "single-screen preflight for token-saving DeepSeek runs",
    badge: report.status,
    badgeTone: toneForStatus(report.status),
    ratio: report.score / 100,
    summary: `score=${report.score} telemetry=${report.telemetry.rate} pins=${report.pinCount} shapes=${report.totalShapes}`,
    rows,
    footer: "/cache pin apply <goal> | /cache plan <goal> | /cache doctor",
  };
}

function toneForStatus(status: CacheReadinessStatus): TerminalTone {
  if (status === "ready") return "success";
  if (status === "review") return "warning";
  return "muted";
}

function toneForSeverity(severity: string): TerminalTone {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "success";
}

function toneForRate(rate: string): TerminalTone {
  const value = Number(rate.replace("%", ""));
  if (!Number.isFinite(value)) return "muted";
  if (value >= 60) return "success";
  return "warning";
}

function recommendationTone(recommendation: string): TerminalTone {
  return /strong|looks strong/i.test(recommendation) ? "success" : "brand";
}
