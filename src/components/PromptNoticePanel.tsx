import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "./design/textLayout.js";

export type PromptNoticeKind = "clear-pending";

export function PromptNoticePanel(props: {
  kind: PromptNoticeKind;
  width: number;
}): React.ReactElement {
  return (
    <Box paddingX={1} width={props.width}>
      <Text color="yellow">
        {truncateCells(promptNoticeText(props.kind), Math.max(16, props.width - 2))}
      </Text>
    </Box>
  );
}

export function promptNoticeText(kind: PromptNoticeKind): string {
  if (kind === "clear-pending") {
    return "Press Esc again to clear the current input.";
  }
  return "";
}
