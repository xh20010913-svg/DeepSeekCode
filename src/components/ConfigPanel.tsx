import React from "react";
import { Box, Text } from "ink";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { InferenceBudget } from "../services/inference/inferenceSettingsService.js";
import type { RuntimePermissionState } from "../services/permissions/permissionProfiles.js";
import type { OutputStyle } from "../outputStyles/index.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface ConfigPanelModel {
  title: string;
  subtitle: string;
  rows: ConfigPanelRow[];
  footer: string;
}

export interface ConfigPanelRow {
  key: string;
  label: string;
  status: string;
  tone: TerminalTone;
  value: string;
  note: string;
}

export function ConfigPanel(props: {
  model: ConfigPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(52, Math.min(112, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="config" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label="redacted" tone="muted" />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.map((row) => (
            <ConfigPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function configPanelModel(input: {
  config: RuntimeConfig;
  outputStyle: OutputStyle;
  inference: InferenceBudget;
  permissions: RuntimePermissionState;
}): ConfigPanelModel {
  const provider = input.config.provider;
  const rows: ConfigPanelRow[] = [
    {
      key: "provider",
      label: "provider",
      status: provider ? "ready" : "missing",
      tone: provider ? "success" : "warning",
      value: provider
        ? `${provider.name} ${provider.kind} ${provider.model}`
        : "DEEPSEEK_API_KEY not configured",
      note: provider ? `${provider.baseUrl} apiKey=[redacted]` : "set DEEPSEEK_API_KEY in .env or provider profile",
    },
    {
      key: "model",
      label: "model",
      status: "active",
      tone: "brand",
      value: input.config.model,
      note: provider?.reasoningEffort ? `reasoning=${provider.reasoningEffort}` : "",
    },
    {
      key: "project",
      label: "project",
      status: "path",
      tone: "muted",
      value: input.config.projectPath,
      note: `state=${input.config.stateDbPath}`,
    },
    {
      key: "data",
      label: "data",
      status: "path",
      tone: "muted",
      value: input.config.dataDir,
      note: "runtime state and transcripts",
    },
    {
      key: "style",
      label: "style",
      status: input.outputStyle.scope,
      tone: input.outputStyle.scope === "builtin" ? "brand" : "success",
      value: input.outputStyle.name,
      note: input.outputStyle.description,
    },
    {
      key: "inference",
      label: "effort",
      status: input.inference.effort,
      tone: input.inference.effort === "max" ? "warning" : "brand",
      value: `action=${input.inference.actionContextChars}/${input.inference.actionDynamicChars}`,
      note: `side=${input.inference.sideQuestionContextChars}/${input.inference.sideQuestionDynamicChars} maxOutput=${input.inference.maxOutputTokens}`,
    },
    {
      key: "permissions",
      label: "perm",
      status: input.permissions.profile ?? input.config.permissionProfile,
      tone: input.permissions.allowShell || input.permissions.allowBrowser ? "warning" : "success",
      value: `shell=${input.permissions.allowShell ? "on" : "off"} browser=${input.permissions.allowBrowser ? "on" : "off"}`,
      note: "/permissions profile safe|dev|browser|open",
    },
  ];

  return {
    title: "DeepSeekCode runtime config",
    subtitle: "safe read-only view; secrets are never printed",
    rows,
    footer: "/config shows runtime settings; /doctor verifies native tool calling and integrations",
  };
}

function ConfigPanelRowView(props: {
  row: ConfigPanelRow;
  width: number;
}): React.ReactElement {
  const valueWidth = Math.max(20, props.width - 36);
  const noteWidth = Math.max(20, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.label.padEnd(9), 9)}</Text>
        <Text color="gray">{truncateCells(props.row.value, valueWidth)}</Text>
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
