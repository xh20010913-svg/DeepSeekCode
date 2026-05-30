import React from "react";
import { Box, Text } from "ink";
import type { CacheGuardReport } from "../services/cache/cacheGuard.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CacheGuardPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  ratio: number;
  summary: string;
  rows: CacheGuardPanelRow[];
  footer: string;
}

export interface CacheGuardPanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  detail: string;
}

export function CacheGuardPanel(props: {
  model: CacheGuardPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(116, columns - 4));
  const nameWidth = Math.max(14, Math.min(28, Math.floor(width * 0.27)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache guard" tone={props.model.badgeTone} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <StatusBadge label="hit" tone={props.model.badgeTone} />
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

export function buildCacheGuardPanelModel(report: CacheGuardReport): CacheGuardPanelModel {
  const rows: CacheGuardPanelRow[] = [
    {
      key: "profile",
      label: "prof",
      tone: report.profile === "none" ? "muted" : toneForDecision(report.decision),
      name: report.profile,
      detail: `preflight=${report.preflightStatus} forecast=${report.forecastStatus} readiness=${report.readinessScore}`,
    },
    {
      key: "tokens",
      label: "tok",
      tone: toneForDecision(report.decision),
      name: `hit ${Math.round(report.estimatedHitRate * 100)}%`,
      detail: `stable~${report.stableTokens} dynamic~${report.dynamicTokens} reusable~${report.reusableTokens}`,
    },
    ...report.blockers.slice(0, 3).map((blocker, index) => ({
      key: `block:${index}`,
      label: "block",
      tone: "error" as const,
      name: `block ${index + 1}`,
      detail: blocker,
    })),
    ...report.warnings.slice(0, 3).map((warning, index) => ({
      key: `warn:${index}`,
      label: "warn",
      tone: "warning" as const,
      name: `warn ${index + 1}`,
      detail: warning,
    })),
    ...report.recommendations.slice(0, 3).map((recommendation, index) => ({
      key: `rec:${index}`,
      label: "tip",
      tone: "brand" as const,
      name: `next ${index + 1}`,
      detail: recommendation,
    })),
  ];
  return {
    title: "DeepSeek cache guard",
    subtitle: report.goal,
    badge: report.decision,
    badgeTone: toneForDecision(report.decision),
    ratio: report.estimatedHitRate,
    summary: `profile=${report.profile} blockers=${report.blockers.length} warnings=${report.warnings.length}`,
    rows,
    footer: report.nextCommands.slice(0, 3).join(" | "),
  };
}

function toneForDecision(decision: string): TerminalTone {
  if (decision === "block") return "error";
  if (decision === "prepare") return "warning";
  return "success";
}
