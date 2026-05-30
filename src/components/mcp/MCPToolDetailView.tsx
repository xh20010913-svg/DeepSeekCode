import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../design/StatusBadge.js";
import { truncateCells } from "../design/textLayout.js";
import { displayToolName } from "./MCPToolListView.js";
import type { McpToolInfo } from "./types.js";

export interface McpToolDetailModel {
  title: string;
  fullName: string;
  description: string;
  badges: string[];
  parameters: McpToolParameter[];
}

export interface McpToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export function MCPToolDetailView(props: {
  serverName: string;
  tool: McpToolInfo;
  width?: number;
}): React.ReactElement {
  const model = mcpToolDetailModel(props.serverName, props.tool);
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text bold color="cyan">{model.title}</Text>
        {model.badges.map((badge) => (
          <React.Fragment key={badge}>
            <Text> </Text>
            <StatusBadge label={badge} tone={badge === "destructive" ? "error" : "success"} />
          </React.Fragment>
        ))}
      </Box>
      <Text color="gray">{truncateCells(model.fullName, width)}</Text>
      {model.description ? <Text>{truncateCells(model.description, width)}</Text> : null}
      {model.parameters.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Parameters</Text>
          {model.parameters.map((parameter) => (
            <Text key={parameter.name} color="gray">
              {truncateCells(`${parameter.name}${parameter.required ? " *" : ""}: ${parameter.type} ${parameter.description}`, width)}
            </Text>
          ))}
        </Box>
      ) : (
        <Text color="gray">No parameters</Text>
      )}
    </Box>
  );
}

export function mcpToolDetailModel(serverName: string, tool: McpToolInfo): McpToolDetailModel {
  return {
    title: displayToolName(tool.name, serverName),
    fullName: tool.name,
    description: tool.description ?? "",
    badges: [
      tool.readOnly ? "read-only" : "",
      tool.destructive ? "destructive" : "",
      tool.openWorld ? "open-world" : "",
    ].filter(Boolean),
    parameters: schemaParameters(tool.inputSchema ?? tool.input_schema),
  };
}

export function schemaParameters(schema: unknown): McpToolParameter[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const record = schema as Record<string, unknown>;
  const properties = record.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  const required = Array.isArray(record.required) ? new Set(record.required.map(String)) : new Set<string>();
  return Object.entries(properties as Record<string, unknown>).map(([name, value]) => {
    const prop = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return {
      name,
      type: typeof prop.type === "string" ? prop.type : "unknown",
      required: required.has(name),
      description: typeof prop.description === "string" ? prop.description : "",
    };
  });
}
