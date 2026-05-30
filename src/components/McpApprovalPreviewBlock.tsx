import React from "react";
import { Box, Text } from "ink";
import { parseActionSummary } from "./ActionSummaryBlock.js";
import { truncateCells } from "./design/textLayout.js";

export interface McpApprovalPreviewModel {
  action: "mcp_call";
  title: string;
  server: string;
  tool: string;
  argumentSummary: string;
  timeout: string;
  fingerprint: string;
  risk: "medium" | "high";
  note: string;
}

export function McpApprovalPreviewBlock(props: {
  summary: string;
  width?: number;
}): React.ReactElement | null {
  const model = mcpApprovalPreviewModel(props.summary);
  if (!model) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color={model.risk === "high" ? "yellow" : "cyan"}>{model.title}</Text>
        {" "}
        <Text color="gray">{model.risk}</Text>
      </Text>
      <PreviewRow label="server" value={model.server} width={width} />
      <PreviewRow label="tool" value={model.tool} width={width} />
      <PreviewRow label="args" value={model.argumentSummary} width={width} />
      <PreviewRow label="timeout" value={model.timeout} width={width} />
      {model.fingerprint ? <PreviewRow label="sha" value={model.fingerprint} width={width} /> : null}
      <PreviewRow label="note" value={model.note} width={width} color="gray" />
    </Box>
  );
}

export function mcpApprovalPreviewModel(summary: string): McpApprovalPreviewModel | null {
  const parsed = parseActionSummary(summary);
  if (!parsed || parsed.action !== "mcp_call") return null;
  const fields = Object.fromEntries(parsed.fields.map((field) => [field.key, field.value]));
  const server = fields.server || "(unknown server)";
  const tool = fields.tool || "(unknown tool)";
  const argumentCount = Number.parseInt(fields.argumentKeys || "0", 10);
  const hasArguments = Number.isFinite(argumentCount) && argumentCount > 0;
  const timeoutMs = fields.timeoutMs || "10000";
  return {
    action: "mcp_call",
    title: "MCP tool call",
    server,
    tool,
    argumentSummary: hasArguments ? `${argumentCount} key(s)` : "no arguments",
    timeout: `${timeoutMs} ms`,
    fingerprint: fields.sha || "",
    risk: hasArguments ? "high" : "medium",
    note: "MCP tools can perform server-defined side effects; approve only the expected server and tool",
  };
}

function PreviewRow(props: {
  label: string;
  value: string;
  width: number;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(9)} </Text>
      <Text color={props.color ?? "gray"}>{truncateCells(props.value, Math.max(16, props.width - 12))}</Text>
    </Box>
  );
}
