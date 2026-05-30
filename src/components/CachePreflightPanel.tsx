import React from "react";
import { Box, Text } from "ink";
import type { CachePreflightReport, CachePreflightStatus } from "../services/cache/cachePreflight.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CachePreflightPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  ratio: number;
  summary: string;
  rows: CachePreflightPanelRow[];
  footer: string;
}

export interface CachePreflightPanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  detail: string;
}

export function CachePreflightPanel(props: {
  model: CachePreflightPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(116, columns - 4));
  const nameWidth = Math.max(14, Math.min(28, Math.floor(width * 0.27)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache preflight" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <StatusBadge label="ready" tone={props.model.badgeTone} />
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

export function buildCachePreflightPanelModel(report: CachePreflightReport): CachePreflightPanelModel {
  const rows: CachePreflightPanelRow[] = [
    {
      key: "plan",
      label: "plan",
      tone: report.droppedChars > 0 || report.truncatedBlocks.length > 0 ? "warning" : "success",
      name: "prompt budget",
      detail: `tokens~${report.planTokens} dropped=${report.droppedChars} truncated=${report.truncatedBlocks.length ? report.truncatedBlocks.join(",") : "none"}`,
    },
    {
      key: "stability",
      label: "shape",
      tone: toneForRisk(report.stabilityRisk),
      name: "prompt shape",
      detail: `${report.stabilityRisk} dynamic=${Math.round(report.dynamicShare * 100)}% ${report.shapeRepeat} ${report.shapeFingerprint}`,
    },
    {
      key: "pins",
      label: "pin",
      tone: toneForPinSeverity(report.pinSeverity),
      name: "stable pins",
      detail: `count=${report.pinCount} severity=${report.pinSeverity} issues=${report.pinIssues}`,
    },
    {
      key: "suggestions",
      label: "hint",
      tone: report.suggestionCount > 0 ? "brand" : "muted",
      name: "pin suggestions",
      detail: report.topSuggestions.length
        ? report.topSuggestions.map((suggestion) => `${suggestion.name}:${suggestion.score}`).join(" ")
        : "none",
    },
    ...report.recommendations.slice(0, 5).map((recommendation, index) => ({
      key: `rec:${index}`,
      label: "next",
      tone: recommendationTone(recommendation),
      name: `step ${index + 1}`,
      detail: recommendation,
    })),
    ...report.nextCommands.slice(0, 4).map((command, index) => ({
      key: `cmd:${index}`,
      label: "cmd",
      tone: "success" as const,
      name: `command ${index + 1}`,
      detail: command,
    })),
  ];
  return {
    title: "DeepSeek cache preflight",
    subtitle: report.goal,
    badge: report.status,
    badgeTone: toneForStatus(report.status),
    ratio: report.readinessScore / 100,
    summary: `score=${report.readinessScore} effort=${report.effort} readiness=${report.readinessStatus}`,
    rows,
    footer: report.nextCommands.length ? report.nextCommands.join(" | ") : "/cache pin apply <goal> | /cache plan <goal> | /cache doctor",
  };
}

function toneForStatus(status: CachePreflightStatus): TerminalTone {
  if (status === "ready") return "success";
  if (status === "blocked") return "error";
  return "warning";
}

function toneForRisk(risk: string): TerminalTone {
  if (risk === "high") return "error";
  if (risk === "medium") return "warning";
  return "success";
}

function toneForPinSeverity(severity: string): TerminalTone {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "success";
}

function recommendationTone(recommendation: string): TerminalTone {
  return /ready|proceed/i.test(recommendation) ? "success" : "brand";
}
