import React from "react";
import { Box, Text } from "ink";
import { FallbackToolUseErrorMessage, isFallbackToolUseErrorText } from "./FallbackToolUseErrorMessage.js";
import { FallbackToolUseRejectedMessage, isFallbackToolUseRejectedText } from "./FallbackToolUseRejectedMessage.js";
import { MessageResponse, type MessageTone } from "./MessageResponse.js";
import { ToolResultDetail } from "./ToolResultDetail.js";
import { toneColor } from "./design/terminalTheme.js";

export function ToolResultMessage(props: { text: string }): React.ReactElement {
  if (isFallbackToolUseRejectedText(props.text)) {
    return <FallbackToolUseRejectedMessage />;
  }
  if (isFallbackToolUseErrorText(props.text)) {
    return <FallbackToolUseErrorMessage result={props.text} />;
  }

  const status = inferToolResultTone(props.text);
  const title = toolResultTitle(props.text);
  const body = toolResultBody(props.text);
  return (
    <MessageResponse tone={status}>
      <Box flexDirection="column">
        <Text color={toneColor(status) ?? "gray"}>{title}</Text>
        <ToolResultDetail title={title} body={body} tone={status} />
      </Box>
    </MessageResponse>
  );
}

export function inferToolResultTone(text: string): MessageTone {
  if (/\bfailed\b|\berror\b|denied|refusing|blocked/i.test(text)) return "error";
  if (/approval required|awaiting user|paused/i.test(text)) return "warning";
  if (/\bsucceeded\b|\bdone\b|\bcompleted\b|\bok\b/i.test(text)) return "success";
  return "default";
}

export function toolResultTitle(text: string): string {
  return text.split(/\r?\n/)[0]?.trim() || "tool result";
}

export function toolResultBody(text: string): string {
  return text.split(/\r?\n/).slice(1).join("\n").trim();
}
