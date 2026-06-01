import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { UsageSnapshot } from "../protocol/provider.js";
import { useApprovals } from "../hooks/useApprovals.js";
import { cacheRate } from "../query/promptCache.js";
import { estimateUsageCost, priceConfigFromEnv } from "../services/cost/costEstimate.js";
import { readInferenceEffort, type EffortLevel } from "../services/inference/inferenceSettingsService.js";
import { inferProfile, type RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import { isChineseUi, type UiLanguage } from "../services/ui/languageService.js";
import type { UsageTotals } from "../state/sqlite.js";
import type { StateStore } from "../state/sqlite.js";
import { StatusBadge } from "./design/StatusBadge.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { getEffortNotificationText } from "./EffortIndicator.js";

export function Footer(props: {
  busy: boolean;
  queuedCount: number;
  permissions: RuntimePermissionState;
  config: RuntimeConfig;
  state: StateStore;
  sessionStartedAtMs?: number;
  lastTurnUsage?: UsageSnapshot;
  sessionUsage?: UsageSnapshot;
  providerReady: boolean;
  width: number;
  compact?: boolean;
  transcriptScrollOffset?: number;
}): React.ReactElement {
  const profile = props.permissions.profile ?? inferProfile(props.permissions);
  const effort = readInferenceEffort(props.config.projectPath);
  const sessionTotals = usageSnapshotToTotals(props.sessionUsage);
  const cost = estimateUsageCost(sessionTotals, priceConfigFromEnv(process.env, props.config.model));
  const pendingGates = useApprovals(props.state, "pending", 20)
    .filter((gate) => props.sessionStartedAtMs === undefined || gate.createdAtMs >= props.sessionStartedAtMs)
    .length;
  const model = buildFooterModel({
    busy: props.busy,
    queuedCount: props.queuedCount,
    pendingGates,
    profile,
    shellEnabled: props.permissions.allowShell,
    browserEnabled: props.permissions.allowBrowser,
    providerReady: props.providerReady,
    providerModel: props.config.model,
    transcriptScrollOffset: props.transcriptScrollOffset ?? 0,
    effort,
    lastTurnUsage: props.lastTurnUsage,
    sessionUsage: props.sessionUsage,
    estimatedCost: cost.totalCost,
    costCurrency: cost.price.currency,
    costConfigured: cost.configured,
    language: props.config.language,
    compact: Boolean(props.compact),
  });

  return (
    <Box justifyContent="space-between" paddingX={1} width={props.width}>
      <Box flexShrink={0}>
        <StatusBadge label={model.statusLabel} tone={model.statusTone} />
        <Text color="gray" wrap="truncate">{` ${model.left}`}</Text>
      </Box>
      {!props.compact && (
        <Text color="gray" wrap="truncate">{model.hint}</Text>
      )}
      <Text color={props.providerReady ? "gray" : "yellow"} wrap="truncate">{model.right}</Text>
    </Box>
  );
}

export interface FooterModelInput {
  busy: boolean;
  queuedCount: number;
  pendingGates: number;
  profile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
  providerReady: boolean;
  providerModel: string;
  transcriptScrollOffset: number;
  effort?: EffortLevel;
  lastTurnUsage?: UsageSnapshot;
  sessionUsage?: UsageSnapshot;
  estimatedCost?: number;
  costCurrency?: string;
  costConfigured?: boolean;
  language?: UiLanguage;
  compact: boolean;
}

export interface FooterModel {
  statusLabel: string;
  statusTone: TerminalTone;
  left: string;
  hint: string;
  right: string;
}

export function buildFooterModel(input: FooterModelInput): FooterModel {
  const zh = isChineseUi(input.language);
  const queueText = input.queuedCount > 0 ? ` | queue ${input.queuedCount}` : "";
  const hit = input.sessionUsage?.cacheHitTokens ?? 0;
  const miss = input.sessionUsage?.cacheMissTokens ?? 0;
  const cacheText = zh
    ? `缓存 ${cacheRate(hit, miss)} (${formatTokenCount(hit)}/${formatTokenCount(miss)})`
    : `cache ${cacheRate(hit, miss)} (${formatTokenCount(hit)}/${formatTokenCount(miss)})`;
  const usageText = zh
    ? `本轮 ${formatTokenCount(input.lastTurnUsage?.inputTokens ?? 0)}入/${formatTokenCount(input.lastTurnUsage?.outputTokens ?? 0)}出 | 合计 ${formatTokenCount(totalTokens(input.sessionUsage))} tok`
    : `turn ${formatTokenCount(input.lastTurnUsage?.inputTokens ?? 0)} in/${formatTokenCount(input.lastTurnUsage?.outputTokens ?? 0)} out | total ${formatTokenCount(totalTokens(input.sessionUsage))} tok`;
  const costText = input.costConfigured && input.estimatedCost !== undefined
    ? `${zh ? "估" : "est"} ${input.costCurrency ?? "USD"} ${input.estimatedCost.toFixed(6)}`
    : zh ? "估价未配置" : "cost unconfigured";
  const effortText = getEffortNotificationText(input.effort, input.providerModel);
  const gatesText = zh ? `待处理 ${input.pendingGates}` : `attention ${input.pendingGates}`;
  const permissionText = [
    input.profile,
    `shell ${input.shellEnabled ? (zh ? "开" : "on") : (zh ? "关" : "off")}`,
    `browser ${input.browserEnabled ? (zh ? "开" : "on") : (zh ? "关" : "off")}`,
  ].join(" | ");
  const providerText = input.providerReady ? input.providerModel : (zh ? "provider 缺失" : "provider missing");
  return {
    statusLabel: input.busy ? (zh ? "工作中" : "working") : (zh ? "空闲" : "idle"),
    statusTone: input.busy ? "warning" : "muted",
    left: `${cacheText} | ${usageText} | ${costText} | ${effortText}${queueText}`,
    hint: input.transcriptScrollOffset > 0
      ? zh ? "正在查看更早记录：Down/PageDown 回到最新" : "Viewing earlier transcript: Down/PageDown returns to latest"
      : input.pendingGates > 0
      ? zh ? "权限提示：Up/Down 选择 | Enter 确认 | Esc 取消/拒绝" : "Permission prompt: Up/Down select | Enter confirm | Esc cancel/reject"
      : input.busy
        ? zh ? "Enter 追加下一条 | /cancel 停止任务 | ? 快捷键" : "Enter queues next prompt | /cancel stops run | ? shortcuts"
        : zh ? "Up/Down 滚动记录 | Ctrl+Up/Ctrl+Down 历史输入 | /model 切模型 | ? 快捷键" : "Up/Down scroll | Ctrl+Up/Ctrl+Down history | /model switch | ? shortcuts",
    right: input.compact
      ? `${permissionText} | ${gatesText} | ${providerText}`
      : `${permissionText} | ${gatesText} | ${providerText}`,
  };
}

function totalTokens(usage?: UsageSnapshot): number {
  return (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
}

function usageSnapshotToTotals(usage?: UsageSnapshot): UsageTotals {
  const hasUsage = totalTokens(usage) > 0 || (usage?.cacheHitTokens ?? 0) > 0 || (usage?.cacheMissTokens ?? 0) > 0;
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheHitTokens: usage?.cacheHitTokens ?? 0,
    cacheMissTokens: usage?.cacheMissTokens ?? 0,
    snapshots: hasUsage ? 1 : 0,
  };
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
