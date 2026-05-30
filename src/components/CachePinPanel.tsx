import React from "react";
import { Box, Text } from "ink";
import type { CachePinAuditReport, CachePinAuditSeverity } from "../services/cache/cachePinAudit.js";
import type { CachePinApplyResult, CachePinSuggestion } from "../services/cache/cachePinSuggestions.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface CachePinPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  summary: string;
  rows: CachePinPanelRow[];
  footer: string;
}

export interface CachePinPanelRow {
  key: string;
  label: string;
  tone: TerminalTone;
  name: string;
  sourcePath: string;
  detail: string;
}

export function CachePinPanel(props: {
  model: CachePinPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(62, Math.min(112, columns - 4));
  const nameWidth = Math.max(12, Math.min(24, Math.floor(width * 0.22)));
  const sourceWidth = Math.max(18, Math.min(40, Math.floor(width * 0.35)));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="cache pins" tone="brand" paddingX={1}>
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
              <Text color="gray">{truncateCells(row.sourcePath.padEnd(sourceWidth), sourceWidth)}</Text>
              <Text color="gray"> {truncateCells(row.detail, Math.max(12, width - nameWidth - sourceWidth - 16))}</Text>
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

export function buildCachePinApplyPanelModel(result: CachePinApplyResult): CachePinPanelModel {
  const rows: CachePinPanelRow[] = [
    ...result.created.map((pin) => ({
      key: `created:${pin.name}`,
      label: "new",
      tone: "success" as const,
      name: pin.name,
      sourcePath: pin.sourcePath,
      detail: `chars=${pin.chars}`,
    })),
    ...result.skipped.slice(0, 6).map((pin) => ({
      key: `skipped:${pin.name}`,
      label: "skip",
      tone: "muted" as const,
      name: pin.name,
      sourcePath: pin.sourcePath,
      detail: "already pinned",
    })),
    ...result.errors.slice(0, 6).map((error) => ({
      key: `error:${error.name}`,
      label: "err",
      tone: "error" as const,
      name: error.name,
      sourcePath: error.sourcePath,
      detail: error.message,
    })),
  ];
  if (rows.length === 0) {
    rows.push({
      key: "empty",
      label: "idle",
      tone: "muted",
      name: "no-new-pins",
      sourcePath: result.goal || "project",
      detail: "inspect candidates with /cache pin suggest",
    });
  }
  return {
    title: "DeepSeek cache pin apply",
    subtitle: result.goal ? `goal: ${result.goal}` : "stable project facts",
    badge: result.errors.length > 0 ? "review" : result.created.length > 0 ? "updated" : "unchanged",
    badgeTone: result.errors.length > 0 ? "warning" : result.created.length > 0 ? "success" : "muted",
    summary: `created=${result.created.length} skipped=${result.skipped.length} errors=${result.errors.length} limit=${result.limit}`,
    rows,
    footer: "/cache pin audit | /cache plan <goal> | /cache pin suggest [goal]",
  };
}

export function buildCachePinSuggestPanelModel(input: {
  suggestions: CachePinSuggestion[];
  goal?: string;
}): CachePinPanelModel {
  const rows: CachePinPanelRow[] = input.suggestions.map((suggestion, index) => ({
    key: `suggest:${suggestion.name}:${suggestion.sourcePath}`,
    label: suggestion.alreadyPinned ? "pin" : String(index + 1),
    tone: suggestion.alreadyPinned ? "muted" : "brand",
    name: suggestion.name,
    sourcePath: suggestion.sourcePath,
    detail: `score=${suggestion.score} chars=${suggestion.chars} ${suggestion.reason}`,
  }));
  if (rows.length === 0) {
    rows.push({
      key: "empty",
      label: "none",
      tone: "muted",
      name: "no-candidate",
      sourcePath: input.goal || "project",
      detail: "add a stable pin manually or write docs/README first",
    });
  }
  return {
    title: "DeepSeek cache pin suggestions",
    subtitle: input.goal ? `goal: ${input.goal}` : "stable project facts",
    badge: input.suggestions.length > 0 ? "candidates" : "empty",
    badgeTone: input.suggestions.length > 0 ? "brand" : "muted",
    summary: `candidates=${input.suggestions.length} alreadyPinned=${input.suggestions.filter((item) => item.alreadyPinned).length}`,
    rows,
    footer: "/cache pin apply [goal] | /cache pin from <file> [name] | /cache pin audit",
  };
}

export function buildCachePinAuditPanelModel(report: CachePinAuditReport): CachePinPanelModel {
  const rows: CachePinPanelRow[] = report.items.map((item, index) => ({
    key: `audit:${item.pin}:${item.code}:${index}`,
    label: item.severity,
    tone: toneForAuditSeverity(item.severity),
    name: item.pin,
    sourcePath: item.code,
    detail: item.message,
  }));
  if (rows.length === 0) {
    rows.push({
      key: "healthy",
      label: "ok",
      tone: "success",
      name: report.pinCount > 0 ? "cache-pins" : "no-pins",
      sourcePath: "audit",
      detail: report.recommendation,
    });
  }
  return {
    title: "DeepSeek cache pin audit",
    subtitle: report.recommendation,
    badge: report.severity,
    badgeTone: toneForAuditSeverity(report.severity),
    summary: `pins=${report.pinCount} chars=${report.totalChars} issues=${report.items.length}`,
    rows,
    footer: report.severity === "ok"
      ? "/cache plan <goal> | /cache pin suggest [goal]"
      : "/cache pin show <name> | /cache pin remove <name> | /cache pin apply [goal]",
  };
}

function toneForAuditSeverity(severity: CachePinAuditSeverity): TerminalTone {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "success";
}
