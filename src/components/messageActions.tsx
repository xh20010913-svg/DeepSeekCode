import React from "react";
import { Box, Text } from "ink";
import type { TranscriptMessageItem } from "./TranscriptMessage.js";
import { SelectList, type SelectListOption } from "./design/SelectList.js";

export type MessageActionId = "copy" | "retry" | "rewind" | "compact" | "inspect";

export function messageActionOptions(item: TranscriptMessageItem): SelectListOption[] {
  const isUser = item.role === "user";
  const isAssistant = item.role === "assistant";
  const isTool = item.role === "tool" || item.role === "tool-start";
  return [
    { id: "copy", label: "Copy", detail: "copy message text", selected: true, tone: "brand" },
    { id: "retry", label: "Retry", detail: "retry from this turn", disabled: !isUser && !isAssistant, tone: "warning" },
    { id: "rewind", label: "Rewind", detail: "checkpoint restore flow", disabled: !isUser, tone: "error" },
    { id: "compact", label: "Compact", detail: "summarize older context", tone: "success" },
    { id: "inspect", label: "Inspect", detail: isTool ? "open tool details" : "show message metadata", tone: "muted" },
  ];
}

export function MessageActions(props: {
  item: TranscriptMessageItem;
  width?: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Message actions</Text>
      <SelectList options={messageActionOptions(props.item)} width={props.width} visibleCount={5} />
    </Box>
  );
}
