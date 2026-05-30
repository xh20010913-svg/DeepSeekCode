import React from "react";
import { Box, Text } from "ink";
import type { McpServerConfig, McpValidationResult } from "../mcp/config.js";
import type { McpSessionSnapshot } from "../mcp/sessionPool.js";
import type { McpHealthResult } from "../services/mcp/mcpService.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { Pane } from "./design/Pane.js";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";
import type { TerminalTone } from "./design/terminalTheme.js";

export interface McpPanelModel {
  title: string;
  subtitle: string;
  rows: McpPanelRow[];
  footer: string;
}

export interface McpPanelRow {
  key: string;
  name: string;
  status: string;
  tone: TerminalTone;
  detail: string;
  note: string;
}

export function McpPanel(props: {
  model: McpPanelModel;
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = Math.max(48, Math.min(108, columns - 4));
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Pane width={width} title="mcp" tone="brand" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="cyan">{props.model.title}</Text>
            <Text color="gray">{truncateCells(props.model.subtitle, Math.max(24, width - 20))}</Text>
          </Box>
          <StatusBadge label={`${props.model.rows.length}`} tone={props.model.rows.length > 0 ? "brand" : "muted"} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {props.model.rows.length === 0 ? (
            <Text color="gray">No MCP entries</Text>
          ) : props.model.rows.map((row) => (
            <McpPanelRowView key={row.key} row={row} width={width} />
          ))}
        </Box>
        <Text color="gray">{truncateCells(props.model.footer, Math.max(24, width - 4))}</Text>
      </Pane>
    </Box>
  );
}

export function mcpServersPanelModel(servers: McpServerConfig[]): McpPanelModel {
  return {
    title: "MCP servers",
    subtitle: `${servers.length} configured server${servers.length === 1 ? "" : "s"}`,
    rows: servers.map((server) => ({
      key: server.name,
      name: server.name,
      status: server.enabled ? "enabled" : "disabled",
      tone: server.enabled ? "success" : "muted",
      detail: `${server.type} ${server.command ?? server.url ?? ""}`.trim(),
      note: server.description || nextActionForServer(server),
    })),
    footer: "/mcp health | /mcp tools <name> | /mcp connect <name>",
  };
}

export function mcpValidationPanelModel(results: McpValidationResult[]): McpPanelModel {
  return {
    title: "MCP validation",
    subtitle: `${results.length} validation result${results.length === 1 ? "" : "s"}`,
    rows: results.map((result) => ({
      key: result.name,
      name: result.name,
      status: result.ok ? "ok" : "failed",
      tone: result.ok ? "success" : "error",
      detail: result.ok ? "config valid" : result.errors.join("; "),
      note: result.warnings.length > 0 ? `warning: ${result.warnings.join("; ")}` : "",
    })),
    footer: "/mcp show <name> | /mcp enable <name> | /mcp disable <name>",
  };
}

export function mcpHealthPanelModel(results: McpHealthResult[]): McpPanelModel {
  return {
    title: "MCP health",
    subtitle: `${results.length} probed server${results.length === 1 ? "" : "s"}`,
    rows: results.map((result) => ({
      key: result.name,
      name: result.name,
      status: result.status,
      tone: toneForHealth(result.status),
      detail: `${result.type} tools=${result.toolCount} latency=${result.latencyMs}ms attempts=${result.attempts}`,
      note: result.error || stderrNote(result.stderr),
    })),
    footer: "/mcp connect <name> keeps a session warm for repeated tool calls",
  };
}

export function mcpSessionsPanelModel(sessions: McpSessionSnapshot[]): McpPanelModel {
  return {
    title: "MCP sessions",
    subtitle: `${sessions.length} connected session${sessions.length === 1 ? "" : "s"}`,
    rows: sessions.map((session) => ({
      key: session.name,
      name: session.name,
      status: "connected",
      tone: "success",
      detail: `${session.type} tools=${session.toolCount} lastUsed=${new Date(session.lastUsedAtMs).toISOString()}`,
      note: `connected=${new Date(session.connectedAtMs).toISOString()}`,
    })),
    footer: "/mcp close <name> | /mcp close all",
  };
}

export function mcpToolsPanelModel(serverName: string, tools: unknown[], stderr = ""): McpPanelModel {
  return {
    title: `MCP tools: ${serverName}`,
    subtitle: `${tools.length} available tool${tools.length === 1 ? "" : "s"}`,
    rows: tools.map((tool, index) => toolRow(serverName, tool, index)),
    footer: stderr.trim()
      ? `stderr: ${compact(stderr)}`
      : `/mcp call ${serverName} <tool> {"arg":"value"}`,
  };
}

function McpPanelRowView(props: {
  row: McpPanelRow;
  width: number;
}): React.ReactElement {
  const detailWidth = Math.max(18, props.width - 28);
  const noteWidth = Math.max(18, props.width - 12);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <StatusBadge label={props.row.status} tone={props.row.tone} />
        <Text> </Text>
        <Text color="cyan">{truncateCells(props.row.name.padEnd(16), 16)}</Text>
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

function nextActionForServer(server: McpServerConfig): string {
  if (!server.enabled) return `/mcp enable ${server.name}`;
  return server.type === "stdio"
    ? "stdio MCP requires shell permission for probe/call"
    : "http MCP can probe without shell permission";
}

function toneForHealth(status: McpHealthResult["status"]): TerminalTone {
  if (status === "ok") return "success";
  if (status === "disabled") return "muted";
  return "error";
}

function stderrNote(stderr: string | undefined): string {
  const value = stderr?.trim() ?? "";
  return value ? `stderr: ${compact(value)}` : "";
}

function toolRow(serverName: string, value: unknown, index: number): McpPanelRow {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const name = String(record.name ?? `tool_${index + 1}`);
    const description = typeof record.description === "string" ? record.description : "";
    return {
      key: `${serverName}:${name}:${index}`,
      name,
      status: "tool",
      tone: "brand",
      detail: description || "no description",
      note: toolSchemaNote(record.inputSchema ?? record.input_schema),
    };
  }
  return {
    key: `${serverName}:tool:${index}`,
    name: `tool_${index + 1}`,
    status: "tool",
    tone: "brand",
    detail: compact(JSON.stringify(value)),
    note: "",
  };
}

function toolSchemaNote(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return "";
  const keys = Object.keys(properties);
  if (keys.length === 0) return "";
  return `params: ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", ..." : ""}`;
}

function compact(value: string, maxChars = 160): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > maxChars ? `${singleLine.slice(0, maxChars - 3)}...` : singleLine;
}
