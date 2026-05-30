import React from "react";
import { Box, Text } from "ink";
import type { SshHealthResult } from "../services/remote/sshHealth.js";
import type { SshWorkerDrainResult } from "../services/remote/sshQueueWorker.js";
import type { SshCommandRecord, SshProfile, SshSessionRecord } from "../services/remote/sshProfileService.js";
import { formatSshTarget } from "../services/remote/sshProfileService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface SshPanelModel {
  title: string;
  subtitle: string;
  rows: SshPanelRow[];
  preview?: string[];
  footer: string;
}

export interface SshPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function SshPanel(props: {
  model: SshPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="ssh" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No SSH records</Text>
          ) : props.model.rows.map((row) => (
            <SshPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.preview && props.model.preview.length > 0 ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="gray">ssh detail</Text>
            {props.model.preview.map((line, index) => (
              <Text key={`${index}-${line}`} color="gray">{truncateCells(`  ${line}`, Math.max(24, width - 4))}</Text>
            ))}
          </Box>
        ) : null}
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function sshProfilesPanelModel(profiles: SshProfile[]): SshPanelModel {
  return {
    title: "SSH profiles",
    subtitle: `${profiles.length} configured profile${profiles.length === 1 ? "" : "s"}`,
    rows: profiles.map((profile) => sshProfileRow(profile)),
    footer: "/ssh show <name> | /ssh health <name> | /ssh connect <name>",
  };
}

export function sshProfileDetailPanelModel(profile: SshProfile, preview: string): SshPanelModel {
  return {
    title: `SSH profile: ${profile.name}`,
    subtitle: formatSshTarget(profile),
    rows: [sshProfileRow(profile)],
    preview: [
      `preview: ${preview}`,
      profile.remotePath ? `remote path: ${profile.remotePath}` : "remote path: (none)",
    ],
    footer: `/ssh health ${profile.name} | /ssh run ${profile.name} <command>`,
  };
}

export function sshSessionsPanelModel(sessions: SshSessionRecord[]): SshPanelModel {
  return {
    title: "SSH sessions",
    subtitle: `${sessions.length} recent session${sessions.length === 1 ? "" : "s"}`,
    rows: sessions.map((session) => ({
      key: session.id,
      name: session.id,
      status: session.status,
      tone: toneForSession(session.status),
      detail: `${session.profileName} ${session.target}`,
      note: `updated=${new Date(session.updatedAtMs).toISOString()}`,
    })),
    footer: "/ssh close <session-id> | /ssh connect <name>",
  };
}

export function sshHistoryPanelModel(records: SshCommandRecord[]): SshPanelModel {
  return {
    title: "SSH history",
    subtitle: `${records.length} command record${records.length === 1 ? "" : "s"}`,
    rows: records.map((record) => ({
      key: record.id,
      name: record.id,
      status: record.timedOut ? "timeout" : record.exitCode === 0 ? "ok" : `exit ${record.exitCode ?? "?"}`,
      tone: record.timedOut || record.exitCode !== 0 ? "error" : "success",
      detail: `${record.profileName} ${record.command}`,
      note: `${record.target} duration=${record.durationMs}ms`,
    })),
    footer: "/ssh history [limit] | /ssh run <name> <command>",
  };
}

export function sshHealthPanelModel(result: SshHealthResult, sessionId?: string): SshPanelModel {
  return {
    title: "SSH health",
    subtitle: result.target,
    rows: [{
      key: result.profileName,
      name: result.profileName,
      status: result.status,
      tone: result.status === "ok" ? "success" : "error",
      detail: result.message,
      note: sessionId ? `session=${sessionId}` : "",
    }],
    footer: `/ssh run ${result.profileName} <command> | /ssh sessions`,
  };
}

export function sshWorkerPanelModel(result: SshWorkerDrainResult): SshPanelModel {
  return {
    title: "SSH worker",
    subtitle: `${result.profileName} / ${result.runId}`,
    rows: result.steps.map((step, index) => ({
      key: step.task?.id ?? `step-${index}`,
      name: step.task?.id ?? "idle",
      status: step.status,
      tone: step.status === "completed" ? "success" : step.status === "failed" ? "error" : "muted",
      detail: step.task ? `${step.task.agent}: ${step.task.title}` : step.message,
      note: step.task ? step.message : "",
    })),
    preview: [`status: ${result.status}`, `message: ${result.message}`, `steps: ${result.steps.length}`],
    footer: `/tasks ${result.runId} | /queue ${result.runId}`,
  };
}

export function sshOperationPanelModel(input: {
  title: string;
  subtitle: string;
  name: string;
  status: string;
  detail: string;
  note?: string;
  footer: string;
  tone?: TerminalTone;
  preview?: string[];
}): SshPanelModel {
  return {
    title: input.title,
    subtitle: input.subtitle,
    rows: [{
      key: input.name,
      name: input.name,
      status: input.status,
      tone: input.tone ?? (input.status === "ok" || input.status === "saved" ? "success" : "brand"),
      detail: input.detail,
      note: input.note ?? "",
    }],
    preview: input.preview,
    footer: input.footer,
  };
}

function SshPanelRowView(props: {
  row: SshPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(20, props.width - 38);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.name.padEnd(20), 20)}</Text>
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

function sshProfileRow(profile: SshProfile): SshPanelRow {
  return {
    key: profile.name,
    name: profile.name,
    status: "profile",
    tone: "brand",
    detail: formatSshTarget(profile),
    note: [
      profile.port ? `port=${profile.port}` : "",
      profile.remotePath ? `remotePath=${profile.remotePath}` : "",
    ].filter(Boolean).join(" "),
  };
}

function toneForSession(status: SshSessionRecord["status"]): TerminalTone {
  if (status === "connected") return "success";
  if (status === "failed") return "error";
  if (status === "planned") return "warning";
  return "muted";
}
