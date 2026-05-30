import React from "react";
import { Box, Text } from "ink";
import type { CachePreflightReport } from "../services/cache/cachePreflight.js";
import type { CacheProfileMatch } from "../services/cache/cacheProfiles.js";
import type { CachePinApplyResult } from "../services/cache/cachePinSuggestions.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CachePreparePanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  ratio: number;
  summary: string;
  rows: CachePreparePanelRow[];
  footer: string;
}

export interface CachePreparePanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  detail: string;
}

export function CachePreparePanel(props: {
  model: CachePreparePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(116, columns - 4));
  const nameWidth = Math.max(14, Math.min(28, Math.floor(width * 0.27)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache prepare" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="row" marginTop={1}>
          <StatusBadge label="prefix" tone={props.model.badgeTone} />
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

export function buildCachePreparePanelModel(input: {
  applied: CachePinApplyResult;
  preflight: CachePreflightReport;
  profileMatch?: CacheProfileMatch;
}): CachePreparePanelModel {
  const createdChars = input.applied.created.reduce((sum, pin) => sum + pin.chars, 0);
  const rows: CachePreparePanelRow[] = [
    ...(input.profileMatch ? [{
      key: `profile:${input.profileMatch.profile.name}`,
      label: "prof",
      tone: "success" as const,
      name: input.profileMatch.profile.name,
      detail: `score=${input.profileMatch.score} ${input.profileMatch.reason}`,
    }] : []),
    ...input.applied.created.slice(0, 4).map((pin) => ({
      key: `created:${pin.name}`,
      label: "new",
      tone: "success" as const,
      name: pin.name,
      detail: `source=${pin.sourcePath} chars=${pin.chars}`,
    })),
    ...input.applied.skipped.slice(0, 3).map((pin) => ({
      key: `skipped:${pin.name}`,
      label: "skip",
      tone: "muted" as const,
      name: pin.name,
      detail: `source=${pin.sourcePath} already pinned`,
    })),
    ...input.applied.errors.slice(0, 3).map((error) => ({
      key: `error:${error.name}`,
      label: "err",
      tone: "error" as const,
      name: error.name,
      detail: `${error.sourcePath} ${error.message}`,
    })),
    {
      key: "preflight:readiness",
      label: "ready",
      tone: toneForPreflightStatus(input.preflight.status),
      name: "preflight",
      detail: `status=${input.preflight.status} score=${input.preflight.readinessScore} effort=${input.preflight.effort}`,
    },
    {
      key: "preflight:shape",
      label: "shape",
      tone: toneForRisk(input.preflight.stabilityRisk),
      name: input.preflight.shapeFingerprint,
      detail: `risk=${input.preflight.stabilityRisk} dynamic=${Math.round(input.preflight.dynamicShare * 100)}% ${input.preflight.shapeRepeat}`,
    },
    ...input.preflight.nextCommands.slice(0, 3).map((command, index) => ({
      key: `cmd:${index}`,
      label: "cmd",
      tone: "brand" as const,
      name: `next ${index + 1}`,
      detail: command,
    })),
  ];
  if (input.applied.created.length === 0 && input.applied.skipped.length === 0 && input.applied.errors.length === 0) {
    rows.unshift({
      key: "pins:empty",
      label: "pin",
      tone: "muted",
      name: "no-new-pins",
      detail: "inspect candidates with /cache pin suggest",
    });
  }
  return {
    title: "DeepSeek cache prepare",
    subtitle: input.preflight.goal,
    badge: badgeFor(input),
    badgeTone: toneFor(input),
    ratio: input.preflight.readinessScore / 100,
    summary: [
      input.profileMatch ? `profile=${input.profileMatch.profile.name} match=${input.profileMatch.score}` : undefined,
      `created=${input.applied.created.length}`,
      `skipped=${input.applied.skipped.length}`,
      `boostChars=${createdChars}`,
      `preflight=${input.preflight.status}`,
    ].filter(Boolean).join(" "),
    rows,
    footer: input.preflight.nextCommands.length
      ? input.preflight.nextCommands.join(" | ")
      : "/cache plan <goal> | /cache doctor",
  };
}

function badgeFor(input: {
  applied: CachePinApplyResult;
  preflight: CachePreflightReport;
  profileMatch?: CacheProfileMatch;
}): string {
  if (input.applied.errors.length > 0) return "pin-error";
  if (input.preflight.status === "blocked") return "blocked";
  if (input.profileMatch) return "matched";
  if (input.applied.created.length > 0) return "prepared";
  return input.preflight.status;
}

function toneFor(input: {
  applied: CachePinApplyResult;
  preflight: CachePreflightReport;
  profileMatch?: CacheProfileMatch;
}): TerminalTone {
  if (input.applied.errors.length > 0 || input.preflight.status === "blocked") return "error";
  if (input.preflight.status === "ready") return "success";
  if (input.profileMatch) return "success";
  if (input.applied.created.length > 0) return "success";
  return "warning";
}

function toneForPreflightStatus(status: string): TerminalTone {
  if (status === "blocked") return "error";
  if (status === "ready") return "success";
  return "warning";
}

function toneForRisk(risk: string): TerminalTone {
  if (risk === "high") return "error";
  if (risk === "medium") return "warning";
  return "success";
}
