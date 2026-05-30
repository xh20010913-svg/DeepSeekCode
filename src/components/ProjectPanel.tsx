import React from "react";
import { Box, Text } from "ink";
import type { InitResult } from "../services/init/projectInit.js";
import type { ExportResult } from "../services/export/exportService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { FilePathLink, isLikelyLocalPath } from "./FilePathLink.js";
import { ModelPicker, modelPickerModel, type ModelPickerModel } from "./ModelPicker.js";

export interface ProjectPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  rows: ProjectPanelRow[];
  modelPicker?: ModelPickerModel;
  footer: string;
}

export interface ProjectPanelRow {
  key: string;
  label: string;
  value: string;
  tone?: TerminalTone;
  note?: string;
}

export function ProjectPanel(props: {
  model: ProjectPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(56, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="project" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No project details</Text>
          ) : props.model.rows.map((row) => (
            <ProjectPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        {props.model.modelPicker ? (
          <ModelPicker model={props.model.modelPicker} width={width - 2} />
        ) : null}
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function modelPanelModel(input: {
  model: string;
  providerName?: string | null;
  providerReady: boolean;
  verifiedText?: string;
  verifiedModel?: string;
}): ProjectPanelModel {
  return {
    title: "Model",
    subtitle: input.providerReady ? "DeepSeek provider configured" : "Provider configuration missing",
    badge: input.providerReady ? "ready" : "missing",
    badgeTone: input.providerReady ? "success" : "warning",
    rows: [
      {
        key: "model",
        label: "active",
        value: input.verifiedModel || input.model,
        tone: "brand",
      },
      {
        key: "provider",
        label: "provider",
        value: input.providerName || "not configured",
        tone: input.providerReady ? "success" : "warning",
      },
      ...(input.verifiedText ? [{
        key: "reply",
        label: "verify",
        value: input.verifiedText,
        tone: "success" as TerminalTone,
      }] : []),
    ],
    modelPicker: modelPickerModel({
      activeModel: input.model,
      providerName: input.providerName,
      providerReady: input.providerReady,
      verifiedModel: input.verifiedModel,
    }),
    footer: "/model verify | /config | /doctor",
  };
}

export function branchPanelModel(input: {
  branchOk: boolean;
  branch: string;
  gitStatus: string;
  error?: string;
}): ProjectPanelModel {
  return {
    title: "Git branch",
    subtitle: input.branchOk ? "Current workspace branch and status" : "Git branch unavailable",
    badge: input.branchOk ? "git" : "unavailable",
    badgeTone: input.branchOk ? "success" : "warning",
    rows: [
      {
        key: "branch",
        label: "branch",
        value: input.branchOk ? input.branch || "(detached HEAD or unnamed)" : input.error || "unknown",
        tone: input.branchOk ? "brand" : "warning",
      },
      {
        key: "status",
        label: "status",
        value: input.gitStatus,
        tone: input.gitStatus === "clean" ? "success" : "warning",
      },
    ],
    footer: "/diff git | /status | /review git",
  };
}

export function projectPanelModel(input: {
  projectPath: string;
  dataDir: string;
  stateDbPath: string;
  model: string;
  permissionProfile: string;
}): ProjectPanelModel {
  return {
    title: "Project",
    subtitle: input.projectPath,
    badge: input.permissionProfile,
    badgeTone: input.permissionProfile === "safe" ? "success" : "warning",
    rows: [
      { key: "project", label: "project", value: input.projectPath, tone: "brand" },
      { key: "data", label: "data", value: input.dataDir, tone: "muted" },
      { key: "state", label: "state", value: input.stateDbPath, tone: "muted" },
      { key: "model", label: "model", value: input.model, tone: "brand" },
      { key: "permissions", label: "permissions", value: input.permissionProfile, tone: input.permissionProfile === "safe" ? "success" : "warning" },
    ],
    footer: "/status | /config | /init",
  };
}

export function initPanelModel(result: InitResult, force: boolean): ProjectPanelModel {
  const rows: ProjectPanelRow[] = [
    ...result.created.map((item) => ({
      key: `created-${item}`,
      label: "created",
      value: item,
      tone: "success" as TerminalTone,
    })),
    ...result.existing.map((item) => ({
      key: `existing-${item}`,
      label: force ? "reused" : "existing",
      value: item,
      tone: "muted" as TerminalTone,
    })),
  ];
  return {
    title: "Init",
    subtitle: `${result.created.length} created | ${result.existing.length} existing`,
    badge: result.created.length > 0 ? "updated" : "ready",
    badgeTone: result.created.length > 0 ? "success" : "brand",
    rows,
    footer: "/memory | /cache pin | /plugins | /skills",
  };
}

export function exportPanelModel(input: {
  kind: string;
  id?: string;
  result: ExportResult;
}): ProjectPanelModel {
  return {
    title: "Export",
    subtitle: `${input.kind}${input.id ? ` ${input.id}` : ""}`,
    badge: input.result.format,
    badgeTone: "success",
    rows: [
      { key: "path", label: "path", value: input.result.path, tone: "brand" },
      { key: "bytes", label: "bytes", value: String(input.result.bytes), tone: "success" },
      { key: "format", label: "format", value: input.result.format, tone: "muted" },
    ],
    footer: "/export run attached | /export status | /trace attached",
  };
}

function ProjectPanelRowView(props: {
  row: ProjectPanelRow;
  width: number;
}): React.ReactElement {
  const labelWidth = 13;
  const valueWidth = Math.max(24, props.width - labelWidth - 8);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.label} tone={props.row.tone ?? "muted"} />
        <Text> </Text>
        {isLikelyLocalPath(props.row.value) ? (
          <FilePathLink filePath={props.row.value} width={valueWidth} color="gray" />
        ) : (
          <Text color="gray">{truncateCells(props.row.value, valueWidth)}</Text>
        )}
      </Box>
      {props.row.note ? (
        <Text color="gray">{truncateCells(`  ${props.row.note}`, Math.max(24, props.width - 4))}</Text>
      ) : null}
    </Box>
  );
}
