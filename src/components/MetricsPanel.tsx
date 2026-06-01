import React from "react";
import { Box, Text } from "ink";
import type { UsageTotals } from "../state/sqlite.js";
import type { CostEstimate } from "../services/cost/costEstimate.js";
import type { WorkspaceStats } from "../services/stats/workspaceStats.js";
import { cacheRate } from "../query/promptCache.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface MetricsPanelModel {
  title: string;
  subtitle: string;
  rows: MetricsPanelRow[];
  cacheHitTokens: number;
  cacheMissTokens: number;
  footer: string;
}

export interface MetricsPanelRow {
  key: string;
  label: string;
  value: string;
  tone: TerminalTone;
  note: string;
}

export function MetricsPanel(props: {
  model: MetricsPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  const totalCache = props.model.cacheHitTokens + props.model.cacheMissTokens;
  const cacheRatio = totalCache > 0 ? props.model.cacheHitTokens / totalCache : 0;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="metrics" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={cacheRate(props.model.cacheHitTokens, props.model.cacheMissTokens)} tone={cacheTone(cacheRatio, totalCache)} />
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <Text color="gray">cache </Text>
          <ProgressBar ratio={cacheRatio} width={Math.max(12, Math.min(34, width - 22))} filledTone={cacheTone(cacheRatio, totalCache)} />
          <Text color="gray"> hit {props.model.cacheHitTokens} / miss {props.model.cacheMissTokens}</Text>
        </Box>
        <Box flexDirection="column">
          {props.model.rows.map((row) => (
            <MetricRow key={row.key} row={row} width={width} />
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function usagePanelModel(scope: string, usage: UsageTotals): MetricsPanelModel {
  return {
    title: "Usage",
    subtitle: scope,
    cacheHitTokens: usage.cacheHitTokens,
    cacheMissTokens: usage.cacheMissTokens,
    rows: [
      metric("snapshots", String(usage.snapshots), "brand", "persisted usage samples"),
      metric("input", String(usage.inputTokens), "muted", "total prompt tokens"),
      metric("output", String(usage.outputTokens), "muted", "total completion tokens"),
      metric("cache hit", String(usage.cacheHitTokens), "success", "DeepSeek cached input tokens"),
      metric("cache miss", String(usage.cacheMissTokens), usage.cacheMissTokens > usage.cacheHitTokens ? "warning" : "muted", "uncached input tokens"),
    ],
    footer: "/cache doctor current | /cost [run-id|process]",
  };
}

export function costPanelModel(scope: string, estimate: CostEstimate): MetricsPanelModel {
  return {
    title: "Cost",
    subtitle: scope,
    cacheHitTokens: estimate.usage.cacheHitTokens,
    cacheMissTokens: estimate.usage.cacheMissTokens,
    rows: [
      metric("estimated", estimate.configured ? money(estimate.totalCost ?? 0, estimate.price.currency) : "unconfigured", estimate.configured ? "success" : "warning", estimate.configured ? priceSourceLabel(estimate.price.source) : "set DEEPSEEKCODE_PRICE_* env vars"),
      metric("input cost", optionalMoney(estimate.inputCost, estimate.price.currency), "muted", `input=${rate(estimate.price.inputPerMillion)}`),
      metric("output cost", optionalMoney(estimate.outputCost, estimate.price.currency), "muted", `output=${rate(estimate.price.outputPerMillion)}`),
      metric("cache savings", optionalMoney(estimate.estimatedCacheSavings, estimate.price.currency), estimate.estimatedCacheSavings ? "success" : "muted", `hit=${rate(estimate.price.cacheHitPerMillion)} miss=${rate(estimate.price.cacheMissPerMillion)}`),
      metric("tokens", `${estimate.usage.inputTokens} in / ${estimate.usage.outputTokens} out`, "brand", `${estimate.usage.snapshots} snapshots`),
    ],
    footer: "/usage [run-id] | /cache doctor current",
  };
}

export function statsPanelModel(stats: WorkspaceStats): MetricsPanelModel {
  return {
    title: "Workspace stats",
    subtitle: `${stats.runs.totalRecent} recent runs / ${stats.sessions} sessions`,
    cacheHitTokens: stats.usage.cacheHitTokens,
    cacheMissTokens: stats.usage.cacheMissTokens,
    rows: [
      metric("runs", `running ${stats.runs.running} / paused ${stats.runs.paused}`, stats.runs.failed ? "warning" : "brand", `ok=${stats.runs.succeeded} failed=${stats.runs.failed} cancelled=${stats.runs.cancelled}`),
      metric("tasks", `queued ${stats.tasks.queued} / running ${stats.tasks.running}`, stats.tasks.failed ? "warning" : "muted", `ok=${stats.tasks.succeeded} failed=${stats.tasks.failed} cancelled=${stats.tasks.cancelled}`),
      metric("sessions", String(stats.sessions), "brand", "persisted transcript sessions"),
      metric("usage", `${stats.usage.inputTokens} in / ${stats.usage.outputTokens} out`, "muted", `${stats.usage.snapshots} snapshots`),
      metric("cache", stats.usage.cacheRate, cacheToneFromText(stats.usage.cacheRate), `hit=${stats.usage.cacheHitTokens} miss=${stats.usage.cacheMissTokens}`),
    ],
    footer: "/runs | /sessions | /usage",
  };
}

function MetricRow(props: {
  row: MetricsPanelRow;
  width: number;
}): React.ReactElement {
  const valueWidth = Math.max(16, props.width - 36);
  const noteWidth = Math.max(20, props.width - 16);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.label} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.value, valueWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Box flexDirection="row">
          <Text color="gray">  </Text>
          <Text color="gray">{truncateCells(props.row.note, noteWidth)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function metric(label: string, value: string, tone: TerminalTone, note: string): MetricsPanelRow {
  return { key: label, label, value, tone, note };
}

function cacheTone(ratio: number, total: number): TerminalTone {
  if (total <= 0) return "muted";
  if (ratio >= 0.75) return "success";
  if (ratio >= 0.35) return "warning";
  return "error";
}

function cacheToneFromText(value: string): TerminalTone {
  const parsed = Number.parseInt(value.replace("%", ""), 10);
  if (!Number.isFinite(parsed)) return "muted";
  return cacheTone(parsed / 100, 1);
}

function rate(value: number | undefined): string {
  return value === undefined ? "unset" : `${value}/M`;
}

function optionalMoney(value: number | undefined, currency: string): string {
  return value === undefined ? "unset" : money(value, currency);
}

function money(value: number, currency: string): string {
  return `${currency} ${value.toFixed(6)}`;
}

function priceSourceLabel(source: CostEstimate["price"]["source"]): string {
  if (source === "deepseek-default") return "DeepSeek default estimate";
  if (source === "deepseek-default+env") return "DeepSeek default + env";
  if (source === "env") return "DEEPSEEKCODE_PRICE_*";
  return "configured estimate";
}
