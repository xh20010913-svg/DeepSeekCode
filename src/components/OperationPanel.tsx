import React from "react";
import { Box, Text } from "ink";
import type { Tool, ToolPermissionContext } from "../Tool.js";
import type { ValidationGateRecord } from "../state/sqlite.js";
import type { CommandOutput } from "../tools/shell.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { displayRunLabel } from "./ApprovalGateCard.js";

export interface OperationPanelModel {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: TerminalTone;
  rows: OperationPanelRow[];
  footer: string;
}

export interface OperationPanelRow {
  key: string;
  label: string;
  value: string;
  tone: TerminalTone;
  note?: string;
}

export function OperationPanel(props: {
  model: OperationPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(58, Math.min(116, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="ops" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={props.model.badge} tone={props.model.badgeTone} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No operation records</Text>
          ) : props.model.rows.map((row) => (
            <OperationPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function toolsPanelModel(tools: Tool[], context: ToolPermissionContext): OperationPanelModel {
  const rows = tools.map((tool) => toolRow(tool, context));
  const enabled = rows.filter((row) => row.label === "enabled").length;
  const denied = rows.filter((row) => row.note?.includes("permission=deny")).length;
  return {
    title: "Tools",
    subtitle: `${enabled}/${rows.length} enabled | denied=${denied}`,
    badge: `${rows.length}`,
    badgeTone: denied > 0 ? "warning" : "brand",
    rows,
    footer: "/tools show <tool-name> | /permissions | /shell on",
  };
}

export function toolDetailPanelModel(tool: Tool, context: ToolPermissionContext): OperationPanelModel {
  const row = toolRow(tool, context);
  return {
    title: tool.displayName,
    subtitle: tool.name,
    badge: row.label,
    badgeTone: row.tone,
    rows: [
      row,
      {
        key: "description",
        label: "detail",
        value: tool.description,
        tone: "muted",
      },
    ],
    footer: "/tools | /permissions | /approval policy",
  };
}

export function validationPanelModel(gates: ValidationGateRecord[], scope: string): OperationPanelModel {
  const failed = gates.filter((gate) => gate.status === "failed").length;
  const pending = gates.filter((gate) => gate.status === "pending").length;
  return {
    title: "Validation",
    subtitle: `${gates.length} gate${gates.length === 1 ? "" : "s"} | scope=${scope}`,
    badge: failed > 0 ? "failed" : pending > 0 ? "pending" : "passed",
    badgeTone: failed > 0 ? "error" : pending > 0 ? "warning" : "success",
    rows: gates.map((gate) => ({
      key: gate.id,
      label: gate.status,
      value: `${gate.subjectType}:${gate.subjectId}`,
      tone: validationTone(gate.status),
      note: `${displayRunLabel(gate.runId)} | ${gate.summary}`,
    })),
    footer: "/validation <run-id|attached> failed | /export status",
  };
}

export function shellPanelModel(input: {
  allowShell: boolean;
  allowBrowser: boolean;
  profile?: string;
}): OperationPanelModel {
  return {
    title: "Shell permission",
    subtitle: `profile=${input.profile ?? "custom"} | browser=${input.allowBrowser ? "on" : "off"}`,
    badge: input.allowShell ? "on" : "off",
    badgeTone: input.allowShell ? "warning" : "success",
    rows: [
      {
        key: "shell",
        label: "shell",
        value: input.allowShell ? "local shell commands are enabled" : "local shell commands are blocked",
        tone: input.allowShell ? "warning" : "success",
      },
      {
        key: "browser",
        label: "browser",
        value: input.allowBrowser ? "browser control is enabled" : "browser control is blocked",
        tone: input.allowBrowser ? "warning" : "success",
      },
    ],
    footer: "/shell on|off | /permissions profiles | /cmd <command>",
  };
}

export function commandOutputPanelModel(command: string, output: CommandOutput): OperationPanelModel {
  const status = output.timedOut
    ? "timeout"
    : output.exitCode === 0
      ? "exit 0"
      : `exit ${output.exitCode ?? "unknown"}`;
  const rows: OperationPanelRow[] = [
    { key: "command", label: "command", value: command, tone: "brand" },
    { key: "cwd", label: "cwd", value: output.cwd, tone: "muted" },
  ];
  if (output.stdout.trim()) {
    rows.push({ key: "stdout", label: "stdout", value: output.stdout.trim(), tone: "success" });
  }
  if (output.stderr.trim()) {
    rows.push({ key: "stderr", label: "stderr", value: output.stderr.trim(), tone: "error" });
  }
  return {
    title: "Command output",
    subtitle: command,
    badge: status,
    badgeTone: output.timedOut || output.exitCode !== 0 ? "error" : "success",
    rows,
    footer: "/shell off | /approval policy on",
  };
}

function OperationPanelRowView(props: {
  row: OperationPanelRow;
  width: number;
}): React.ReactElement {
  const labelWidth = 14;
  const valueWidth = Math.max(24, props.width - labelWidth - 8);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={truncateCells(props.row.label, labelWidth)} tone={props.row.tone} />
        <Text> </Text>
        <Text color="gray">{truncateCells(props.row.value, valueWidth)}</Text>
      </Box>
      {props.row.note ? (
        <Text color="gray">{truncateCells(`  ${props.row.note}`, Math.max(24, props.width - 4))}</Text>
      ) : null}
    </Box>
  );
}

function toolRow(tool: Tool, context: ToolPermissionContext): OperationPanelRow {
  const enabled = tool.isEnabled(context);
  const permission = tool.checkPermissions({ type: tool.name }, context);
  const label = enabled ? "enabled" : "disabled";
  return {
    key: tool.name,
    label,
    value: `${tool.name} (${tool.displayName})`,
    tone: !enabled ? "muted" : permission.behavior === "allow" ? "success" : "warning",
    note: `permission=${permission.behavior} | ${tool.description}`,
  };
}

function validationTone(status: string): TerminalTone {
  if (status === "passed") return "success";
  if (status === "failed") return "error";
  return "warning";
}
