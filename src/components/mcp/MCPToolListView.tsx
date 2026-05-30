import React from "react";
import { Box, Text } from "ink";
import { SelectList, type SelectListOption } from "../design/SelectList.js";
import { truncateCells } from "../design/textLayout.js";
import type { McpToolInfo } from "./types.js";

export interface McpToolListModel {
  title: string;
  subtitle: string;
  options: SelectListOption[];
}

export function MCPToolListView(props: {
  serverName: string;
  tools: McpToolInfo[];
  selectedIndex?: number;
  width?: number;
}): React.ReactElement {
  const model = mcpToolListModel(props.serverName, props.tools);
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{truncateCells(model.title, width)}</Text>
      <Text color="gray">{truncateCells(model.subtitle, width)}</Text>
      <SelectList options={model.options} selectedIndex={props.selectedIndex} width={width} />
    </Box>
  );
}

export function mcpToolListModel(serverName: string, tools: McpToolInfo[]): McpToolListModel {
  return {
    title: `Tools for ${serverName}`,
    subtitle: `${tools.length} available tool${tools.length === 1 ? "" : "s"}`,
    options: tools.map((tool, index) => ({
      id: `${serverName}:${tool.name}:${index}`,
      label: displayToolName(tool.name, serverName),
      detail: tool.description ?? "no description",
      description: toolAnnotations(tool).join(", "),
      selected: index === 0,
      tone: tool.destructive ? "error" : tool.readOnly ? "success" : "brand",
    })),
  };
}

export function displayToolName(name: string, serverName: string): string {
  const prefixes = [`mcp__${serverName}__`, `${serverName}__`, `${serverName}.`];
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return name;
}

function toolAnnotations(tool: McpToolInfo): string[] {
  return [
    tool.readOnly ? "read-only" : "",
    tool.destructive ? "destructive" : "",
    tool.openWorld ? "open-world" : "",
  ].filter(Boolean);
}
