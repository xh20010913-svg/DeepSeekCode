import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "../design/StatusBadge.js";
import { truncateCells } from "../design/textLayout.js";
import type { McpWarningInfo } from "./types.js";

export interface McpParsingWarningsModel {
  visible: boolean;
  title: string;
  warnings: McpWarningInfo[];
}

export function McpParsingWarnings(props: {
  warnings: McpWarningInfo[];
  width?: number;
}): React.ReactElement | null {
  const model = mcpParsingWarningsModel(props.warnings);
  if (!model.visible) return null;
  const width = props.width ?? 96;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">{model.title}</Text>
      {model.warnings.map((warning, index) => (
        <Box key={`${warning.severity}-${index}`} flexDirection="column">
          <Text>
            <StatusBadge label={warning.severity} tone={warning.severity === "error" ? "error" : "warning"} />
            <Text color="gray"> {truncateCells(warning.message, Math.max(16, width - 12))}</Text>
          </Text>
          {warning.suggestion ? (
            <Text color="gray">{truncateCells(`  -> ${warning.suggestion}`, Math.max(16, width - 4))}</Text>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

export function mcpParsingWarningsModel(warnings: McpWarningInfo[]): McpParsingWarningsModel {
  return {
    visible: warnings.length > 0,
    title: "MCP configuration warnings",
    warnings: warnings.map((warning) => ({
      severity: warning.severity,
      message: compact(warning.message),
      suggestion: warning.suggestion ? compact(warning.suggestion) : undefined,
    })),
  };
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
