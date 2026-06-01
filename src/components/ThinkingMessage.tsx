import React from "react";
import { Box, Text } from "ink";
import { flattenCellText, truncateStartCells } from "./design/textLayout.js";

const DEFAULT_THINKING_PREVIEW_WIDTH = 120;

export function ThinkingMessage(props: {
  text: string;
  previewWidth?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text dimColor italic wrap="truncate">
        {formatThinkingPreview(props.text, props.previewWidth)}
      </Text>
    </Box>
  );
}

export function formatThinkingPreview(
  text: string,
  width = DEFAULT_THINKING_PREVIEW_WIDTH,
): string {
  const normalized = normalizeThinkingText(text);
  if (!normalized) return "thinking...";
  return truncateStartCells(normalized, width);
}

export function normalizeThinkingText(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const doneLine = lines.find((line) => /thinking done/i.test(line));
  const body = flattenCellText(lines.filter((line) => line !== doneLine).join(" "))
    .replace(/^(thinking|reasoning)\s*:\s*/i, "");
  if (doneLine) return `${doneLine} - ${body}`;
  return body;
}
