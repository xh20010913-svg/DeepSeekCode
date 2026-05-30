import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
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
  providerReady: boolean;
  width: number;
  compact?: boolean;
}): React.ReactElement {
  const profile = props.permissions.profile ?? inferProfile(props.permissions);
  const effort = readInferenceEffort(props.config.projectPath);
  const cache = useCacheSummary(props.state);
  const pendingGates = useApprovals(props.state, "pending", 20).length;
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
    effort,
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
  effort?: EffortLevel;
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
  const effortText = getEffortNotificationText(input.effort, input.providerModel);
  const gatesText = `gates ${input.pendingGates}`;
  const permissionText = [
    input.profile,
    `shell ${input.shellEnabled ? "on" : "off"}`,
    `browser ${input.browserEnabled ? "on" : "off"}`,
  ].join(" | ");
  const providerText = input.providerReady ? input.providerModel : "provider missing";
  return {
    statusLabel: input.busy ? "working" : "idle",
    statusTone: input.busy ? "warning" : "muted",
    left: `${cacheText} | ${effortText}${queueText}`,
    hint: input.busy ? "Enter queues next prompt | /cancel stops run | ? shortcuts" : "Ctrl+P commands | Ctrl+O files | Ctrl+R history | ? shortcuts",
    right: input.compact
      ? `${permissionText} | ${gatesText} | ${providerText}`
      : `${permissionText} | ${gatesText} | ${providerText}`,
  };
}
