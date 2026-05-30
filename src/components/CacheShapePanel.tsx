import React from "react";
import { Box, Text } from "ink";
import type { CacheShapeRecord } from "../services/cache/cacheShapeHistory.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CacheShapePanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  summary: string;
  rows: CacheShapePanelRow[];
  footer: string;
}

export interface CacheShapePanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  fingerprint: string;
  detail: string;
  lastSeenAt: string;
}

export function CacheShapePanel(props: {
  model: CacheShapePanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(112, columns - 4));
  const fingerprintWidth = Math.max(12, Math.min(24, Math.floor(width * 0.24)));
  const lastWidth = 19;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache shapes" tone="brand" paddingX={1}>
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
              <Text> {truncateCells(row.fingerprint.padEnd(fingerprintWidth), fingerprintWidth)} </Text>
              <Text color="gray">{truncateCells(row.lastSeenAt.padEnd(lastWidth), lastWidth)}</Text>
              <Text color="gray"> {truncateCells(row.detail, Math.max(12, width - fingerprintWidth - lastWidth - 16))}</Text>
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

export function buildCacheShapePanelModel(records: CacheShapeRecord[]): CacheShapePanelModel {
  const rows = records.map((record) => ({
    key: record.fingerprint,
    label: `x${record.count}`,
    tone: toneForRisk(record.risk),
    fingerprint: record.fingerprint,
    lastSeenAt: compactTime(record.lastSeenAt),
    detail: [
      `risk=${record.risk}`,
      `dynamic=${Math.round(record.dynamicShare * 100)}%`,
      `stable=${record.stableChars}`,
      record.truncatedBlocks.length ? `truncated=${record.truncatedBlocks.join(",")}` : "truncated=none",
    ].join(" "),
  }));
  if (rows.length === 0) {
    rows.push({
      key: "empty",
      label: "none",
      tone: "muted" as const,
      fingerprint: "no-shapes",
      lastSeenAt: "",
      detail: "run /cache plan <goal> to record a content-free prompt shape",
    });
  }
  const repeated = records.filter((record) => record.count > 1).length;
  const risky = records.filter((record) => record.risk !== "low").length;
  return {
    title: "DeepSeek prompt shape history",
    subtitle: "content-free fingerprints for cache-friendly prompt reuse",
    badge: records.length === 0 ? "empty" : risky > 0 ? "review" : "stable",
    badgeTone: records.length === 0 ? "muted" : risky > 0 ? "warning" : "success",
    summary: `shapes=${records.length} repeated=${repeated} review=${risky}`,
    rows,
    footer: "/cache plan <goal> | /cache shapes clear | /cache pin apply [goal]",
  };
}

function toneForRisk(risk: CacheShapeRecord["risk"]): TerminalTone {
  if (risk === "high") return "error";
  if (risk === "medium") return "warning";
  return "success";
}

function compactTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 19);
}
