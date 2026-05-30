import React from "react";
import { Box, Text } from "ink";
import type { CacheTelemetrySummary } from "../services/cache/telemetry.js";
import { StatusIcon, type StatusIconState } from "./design/StatusIcon.js";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export interface CacheEfficiencyNoticeModel {
  state: StatusIconState;
  tone: TerminalTone;
  title: string;
  detail: string;
  recommendation: string;
}

export function buildCacheEfficiencyNotice(cache: CacheTelemetrySummary): CacheEfficiencyNoticeModel {
  const total = cache.hitTokens + cache.missTokens;
  if (total === 0) {
    return {
      state: "pending",
      tone: "muted",
      title: "cache telemetry pending",
      detail: "no DeepSeek cache tokens have been observed yet",
      recommendation: "run /cache plan <goal> before a large edit",
    };
  }

  const ratio = cache.hitTokens / total;
  if (ratio >= 0.65) {
    return {
      state: "success",
      tone: "success",
      title: "strong prefix reuse",
      detail: `${cache.rate} cache hit across ${cache.observedRuns} observed run(s)`,
      recommendation: "keep project facts and tool policy blocks stable",
    };
  }

  if (ratio >= 0.35) {
    return {
      state: "warning",
      tone: "warning",
      title: "cache warming",
      detail: `${cache.rate} cache hit; dynamic context is still moving`,
      recommendation: "pin stable facts with /cache pin add",
    };
  }

  return {
    state: "error",
    tone: "error",
    title: "low cache reuse",
    detail: `${cache.rate} cache hit; most prompt tokens are cold`,
    recommendation: "trim churn with /cache doctor or /cache plan <goal>",
  };
}

export function CacheEfficiencyNotice(props: {
  cache: CacheTelemetrySummary;
  compact?: boolean;
}): React.ReactElement {
  const model = buildCacheEfficiencyNotice(props.cache);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <StatusIcon state={model.state} withSpace />
        <Text color={toneColor(model.tone)}>{model.title}</Text>
      </Box>
      {!props.compact && <Text color="gray">{model.detail}</Text>}
      <Text color="gray">{model.recommendation}</Text>
    </Box>
  );
}
