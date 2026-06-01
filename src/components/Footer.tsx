import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { UsageSnapshot } from "../protocol/provider.js";
import { useApprovals } from "../hooks/useApprovals.js";
import { useCacheSummary } from "../hooks/useCacheSummary.js";
import type { CacheTelemetrySummary } from "../services/cache/telemetry.js";
import { readInferenceEffort, type EffortLevel } from "../services/inference/inferenceSettingsService.js";
import { inferProfile, type RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
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
  const cache = useCacheSummary(props.state);
  const pendingGates = useApprovals(props.state, "pending", 20)
    .filter((gate) => props.sessionStartedAtMs === undefined || gate.createdAtMs >= props.sessionStartedAtMs)
    .length;
  const model = buildFooterModel({
    busy: props.busy,
    queuedCount: props.queuedCount,
    cache,
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
  cache: CacheTelemetrySummary;
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
  const queueText = input.queuedCount > 0 ? ` | queue ${input.queuedCount}` : "";
  const cacheText = input.cache.observedRuns > 0
    ? `cache ${input.cache.rate} (${input.cache.hitTokens}/${input.cache.missTokens})`
    : `cache ${input.cache.rate}`;
  const usageText = `turn ${input.lastTurnUsage?.outputTokens ?? 0} out | total ${totalTokens(input.sessionUsage)}`;
  const effortText = getEffortNotificationText(input.effort, input.providerModel);
  const gatesText = `attention ${input.pendingGates}`;
  const permissionText = [
    input.profile,
    `shell ${input.shellEnabled ? "on" : "off"}`,
    `browser ${input.browserEnabled ? "on" : "off"}`,
  ].join(" | ");
  const providerText = input.providerReady ? input.providerModel : "provider missing";
  return {
    statusLabel: input.busy ? "working" : "idle",
    statusTone: input.busy ? "warning" : "muted",
    left: `${cacheText} | ${usageText} | ${effortText}${queueText}`,
    hint: input.transcriptScrollOffset > 0
      ? "Viewing earlier transcript: Down/PageDown returns to latest"
      : input.pendingGates > 0
      ? "Permission prompt: Up/Down select | Enter confirm | Esc cancel/reject"
      : input.busy
        ? "Enter queues next prompt | /cancel stops run | ? shortcuts"
        : "Up/Down scroll | Ctrl+Up/Ctrl+Down history | /model switch | ? shortcuts",
    right: input.compact
      ? `${permissionText} | ${gatesText} | ${providerText}`
      : `${permissionText} | ${gatesText} | ${providerText}`,
  };
}

function totalTokens(usage?: UsageSnapshot): number {
  return (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
}
