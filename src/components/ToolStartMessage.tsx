import React from "react";
import { Box, Text } from "ink";
import { ToolProgress } from "./ToolProgress.js";
import { flattenCellText, truncateCells } from "./design/textLayout.js";

const DEFAULT_TOOL_START_DETAIL_WIDTH = 120;

export interface ToolStartInfo {
  name: string;
  detail?: string;
}

export function ToolStartMessage(props: {
  text: string;
  detailWidth?: number;
}): React.ReactElement {
  const info = parseToolStartText(props.text, props.detailWidth);
  return (
    <Box flexDirection="column">
      <ToolProgress name={info.name} status="running" detail={info.detail} />
      <Text dimColor>waiting for result</Text>
    </Box>
  );
}

export function parseToolStartText(
  text: string,
  detailWidth = DEFAULT_TOOL_START_DETAIL_WIDTH,
): ToolStartInfo {
  const normalized = flattenCellText(text);
  const match = /^(?<name>[A-Za-z0-9_.:-]+)\s+started(?:\s+(?<detail>.*))?$/i.exec(normalized);
  if (!match?.groups) {
    return { name: "tool", detail: truncateOptional(normalized, detailWidth) };
  }
  const detail = truncateOptional(match.groups.detail ?? "", detailWidth);
  return { name: match.groups.name, detail };
}

function truncateOptional(value: string, width: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return truncateCells(trimmed, width);
}
