import React from "react";
import { Box, Text } from "ink";
import type { ProjectStatusSummary } from "../services/status/projectStatus.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { ProgressBar } from "./design/ProgressBar.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface StatusPanelRow {
  key: string;
  label: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export interface StatusPanelModel {
  title: string;
  subtitle: string;
  rows: StatusPanelRow[];
  cacheHitTokens: number;
  cacheMissTokens: number;
  footer: string;
}

export function StatusPanel(props: {
  model: StatusPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  const cacheTotal = props.model.cacheHitTokens + props.model.cacheMissTokens;
  const cacheRatio = cacheTotal > 0 ? props.model.cacheHitTokens / cacheTotal : 0;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="status" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={cacheTotal > 0 ? `${Math.round(cacheRatio * 100)}% cache` : "cache n/a"} tone={cacheTone(cacheRatio, cacheTotal)} />
        </Box>
        <Box marginTop={1} marginBottom={1}>
          <Text color="gray">cache </Text>
          <ProgressBar ratio={cacheRatio} width={Math.max(12, Math.min(34, width - 22))} filledTone={cacheTone(cacheRatio, cacheTotal)} />
          <Text color="gray"> hit {props.model.cacheHitTokens} / miss {props.model.cacheMissTokens}</Text>
        </Box>
        <Box flexDirection="column">
          {props.model.rows.map((row) => (
            <StatusPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function statusPanelModel(status: ProjectStatusSummary): StatusPanelModel {
  return {
    title: status.product,
    subtitle: `${status.projectPath} / ${status.model}`,
    cacheHitTokens: status.cache.hitTokens,
    cacheMissTokens: status.cache.missTokens,
    rows: [
      row("provider", status.providerReady ? "ready" : "missing", status.providerReady ? "success" : "error", status.model, status.providerReady ? "DeepSeek provider configured" : "configure DEEPSEEK_API_KEY"),
      row("permissions", status.permissionProfile, permissionTone(status), `shell=${onOff(status.permissions.shell)} browser=${onOff(status.permissions.browser)}`, "use /permissions to switch profile"),
      row("runs", `${status.runs.unfinished} open`, status.runs.unfinished > 0 ? "warning" : "success", `recent=${status.runs.totalRecent}`, latestRunNote(status)),
      row("tasks", `${status.tasks.queued} queued`, status.tasks.failed > 0 ? "error" : status.tasks.running > 0 ? "warning" : "muted", `running=${status.tasks.running} ok=${status.tasks.succeeded}`, `failed=${status.tasks.failed} paused=${status.tasks.paused} cancelled=${status.tasks.cancelled}`),
      row("gates", `${status.gates.approvalsPending} approval`, gateTone(status), `validating=${status.gates.validationsPending}`, `failed validations=${status.gates.validationsFailed}`),
      row("git", status.git.available ? status.git.clean ? "clean" : "dirty" : "unavailable", gitTone(status), gitDetail(status), status.git.error ?? ""),
      row("data", "path", "muted", status.dataDir, "local state and transcripts"),
    ],
    footer: "/doctor | /cache doctor current | /runs | /permissions status",
  };
}

function StatusPanelRowView(props: {
  row: StatusPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(20, props.width - 38);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.label.padEnd(20), 20)}</Text>
        <Text color="gray">{truncateCells(props.row.detail, detailWidth)}</Text>
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

function row(key: string, status: string, tone: TerminalTone, detail: string, note: string): StatusPanelRow {
  return { key, label: key, status, tone, detail, note };
}

function onOff(value: boolean): string {
  return value ? "on" : "off";
}

function cacheTone(ratio: number, total: number): TerminalTone {
  if (total <= 0) return "muted";
  if (ratio >= 0.75) return "success";
  if (ratio >= 0.35) return "warning";
  return "error";
}

function permissionTone(status: ProjectStatusSummary): TerminalTone {
  if (status.permissions.shell && status.permissions.browser) return "warning";
  if (status.permissions.shell || status.permissions.browser) return "brand";
  return "success";
}

function gateTone(status: ProjectStatusSummary): TerminalTone {
  if (status.gates.validationsFailed > 0) return "error";
  if (status.gates.approvalsPending > 0 || status.gates.validationsPending > 0) return "warning";
  return "success";
}

function gitTone(status: ProjectStatusSummary): TerminalTone {
  if (!status.git.available) return "muted";
  if (status.git.conflicted > 0) return "error";
  return status.git.clean ? "success" : "warning";
}

function latestRunNote(status: ProjectStatusSummary): string {
  const latest = status.runs.latest;
  return latest ? `${latest.status} ${latest.id} actions=${latest.actionCount} artifacts=${latest.artifactCount} ${latest.message}` : "no runs";
}

function gitDetail(status: ProjectStatusSummary): string {
  const git = status.git;
  if (!git.available) return "git unavailable";
  if (git.clean) return "working tree clean";
  return `M=${git.modified} A=${git.added} D=${git.deleted} R=${git.renamed} ?=${git.untracked} U=${git.conflicted}`;
}
