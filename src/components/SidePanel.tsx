import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { UsageSnapshot } from "../protocol/provider.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import type { StateStore } from "../state/sqlite.js";
import { useAttachedRun } from "../hooks/useAttachedRun.js";
import { useCacheSummary } from "../hooks/useCacheSummary.js";
import { useGitStatus } from "../hooks/useGitStatus.js";
import { useRuns } from "../hooks/useRuns.js";
import { useTodos } from "../hooks/useTodos.js";
import { AttachedRunPanel } from "./AttachedRunPanel.js";
import { CacheEfficiencyNotice } from "./CacheEfficiencyNotice.js";
import { CompactRunList } from "./CompactRunList.js";
import { GitStatus } from "./GitStatus.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { PanelSection } from "./PanelSection.js";
import { PermissionStatus } from "./PermissionStatus.js";
import { ProviderStatus } from "./ProviderStatus.js";
import { TodoPanel } from "./TodoPanel.js";
import { Divider } from "./design/Divider.js";
import { StatusBadge } from "./design/StatusBadge.js";

export function SidePanel(props: {
  config: RuntimeConfig;
  state: StateStore;
  busy: boolean;
  permissions: RuntimePermissionState;
  lastTurnUsage?: UsageSnapshot;
  sessionUsage?: UsageSnapshot;
}): React.ReactElement {
  const runs = useRuns(props.state, 5);
  const cache = useCacheSummary(props.state);
  const attached = useAttachedRun(props.state, props.config.projectPath);
  const git = useGitStatus(props.config.projectPath);
  const todos = useTodos(props.config.projectPath);

  const width = 35;
  return (
    <Box flexDirection="column" width={width} paddingX={1}>
      <Box justifyContent="space-between">
        <Text color="cyan" bold>DeepSeekCode</Text>
        <StatusBadge label={props.busy ? "running" : "idle"} tone={props.busy ? "warning" : "success"} />
      </Box>
      <Divider width={width - 2} tone="muted" />
      <PanelSection title="provider">
        <ProviderStatus config={props.config} />
      </PanelSection>
      <PanelSection title="project">
        <Text>{compact(props.config.projectPath, 30)}</Text>
      </PanelSection>
      <PanelSection title="cache">
        <CacheEfficiencyNotice cache={cache} compact />
      </PanelSection>
      <PanelSection title="usage">
        <UsageSummary lastTurn={props.lastTurnUsage} session={props.sessionUsage} />
      </PanelSection>
      <PanelSection title="git">
        <GitStatus git={git} />
      </PanelSection>
      <PanelSection title="permissions">
        <PermissionStatus {...props.permissions} />
      </PanelSection>
      <PanelSection title="attached run">
        <AttachedRunPanel run={attached.run} runId={attached.runId} />
      </PanelSection>
      <PanelSection title="todos">
        <TodoPanel todos={todos} />
      </PanelSection>
      <PanelSection title="recent runs">
        <CompactRunList runs={runs} />
      </PanelSection>
      <PanelSection title="memory">
        <MemoryPanel projectPath={props.config.projectPath} />
      </PanelSection>
    </Box>
  );
}

function UsageSummary(props: {
  lastTurn?: UsageSnapshot;
  session?: UsageSnapshot;
}): React.ReactElement {
  const last = formatUsage(props.lastTurn);
  const session = formatUsage(props.session);
  return (
    <Box flexDirection="column">
      <Text color="gray">{`turn ${last}`}</Text>
      <Text color="gray">{`session ${session}`}</Text>
    </Box>
  );
}

function formatUsage(usage?: UsageSnapshot): string {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  const hit = usage?.cacheHitTokens ?? 0;
  const miss = usage?.cacheMissTokens ?? 0;
  const cache = hit + miss > 0 ? `${Math.round((hit / (hit + miss)) * 100)}%` : "n/a";
  return `in ${input} / out ${output} / cache ${cache}`;
}

function compact(value: string, max: number): string {
  if (value.length <= max) return value;
  return `...${value.slice(-(max - 3))}`;
}
