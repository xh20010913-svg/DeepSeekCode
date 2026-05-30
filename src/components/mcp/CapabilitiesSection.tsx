import React from "react";
import { Box, Text } from "ink";
import { Byline } from "../design/Byline.js";
import type { McpToneLabel } from "./types.js";

export interface McpCapabilitiesModel {
  labels: McpToneLabel[];
  summary: string;
}

export function CapabilitiesSection(props: {
  serverToolsCount: number;
  serverPromptsCount: number;
  serverResourcesCount: number;
}): React.ReactElement {
  const model = mcpCapabilitiesModel({
    tools: props.serverToolsCount,
    prompts: props.serverPromptsCount,
    resources: props.serverResourcesCount,
  });
  return (
    <Box>
      <Text bold>Capabilities: </Text>
      {model.labels.length > 0 ? (
        <Byline>{model.labels.map((label) => label.label)}</Byline>
      ) : (
        <Text color="gray">none</Text>
      )}
    </Box>
  );
}

export function mcpCapabilitiesModel(input: {
  tools?: number;
  prompts?: number;
  resources?: number;
}): McpCapabilitiesModel {
  const labels: McpToneLabel[] = [];
  if ((input.tools ?? 0) > 0) labels.push({ label: "tools", tone: "brand" });
  if ((input.resources ?? 0) > 0) labels.push({ label: "resources", tone: "success" });
  if ((input.prompts ?? 0) > 0) labels.push({ label: "prompts", tone: "warning" });
  return {
    labels,
    summary: labels.length > 0 ? labels.map((label) => label.label).join(", ") : "none",
  };
}
