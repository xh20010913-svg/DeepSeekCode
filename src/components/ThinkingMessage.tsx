import React from "react";
import { Box, Text } from "ink";
import { flattenCellText, truncateCells } from "./design/textLayout.js";

const DEFAULT_THINKING_PREVIEW_WIDTH = 120;

export function ThinkingMessage(props: {
  text: string;
  previewWidth?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text dimColor italic>
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
  return truncateCells(normalized, width);
}

export function normalizeThinkingText(text: string): string {
  return flattenCellText(text).replace(/^(thinking|reasoning)\s*:\s*/i, "");
}
