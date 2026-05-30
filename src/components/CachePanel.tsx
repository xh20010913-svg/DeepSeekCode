import React from "react";
import { Box, Text } from "ink";
import type { CacheTelemetrySummary } from "../services/cache/telemetry.js";
import { CacheEfficiencyNotice } from "./CacheEfficiencyNotice.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";

export interface CachePanelModel {
  ratio: number;
  status: StatusIconState;
  headline: string;
  detail: string;
}

export function CachePanel(props: { cache: CacheTelemetrySummary }): React.ReactElement {
  const model = buildCachePanelModel(props.cache);
  return (
    <Pane width={42} title="DeepSeek cache" tone="brand">
      <Box flexDirection="row">
        <StatusIcon state={model.status} withSpace />
        <Text>{model.headline}</Text>
      </Box>
      <ProgressBar ratio={model.ratio} width={24} showPercent />
      <Text color="gray">{model.detail}</Text>
      <CacheEfficiencyNotice cache={props.cache} />
    </Pane>
  );
}

export function buildCachePanelModel(cache: CacheTelemetrySummary): CachePanelModel {
  const total = cache.hitTokens + cache.missTokens;
  const ratio = total > 0 ? cache.hitTokens / total : parsePercentRatio(cache.rate);
  const status: StatusIconState = total === 0 ? "pending" : ratio >= 0.5 ? "success" : "warning";
  return {
    ratio,
    status,
    headline: total === 0 ? "waiting for provider telemetry" : `cache hit ${cache.rate}`,
    detail: `hit ${cache.hitTokens} / miss ${cache.missTokens} / runs ${cache.observedRuns}`,
  };
}

export function parsePercentRatio(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return 0;
  const percent = Number(match[1]);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(1, percent / 100));
}
