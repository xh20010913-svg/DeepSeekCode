import React from "react";
import { Box, Text } from "ink";
import { InterruptedByUser } from "./InterruptedByUser.js";
import { Markdown } from "./Markdown.js";
import { MessageResponse } from "./MessageResponse.js";

export type AssistantTextKind = "normal" | "empty" | "context-limit" | "provider-error" | "interrupted";

export function AssistantTextMessage(props: {
  text: string;
}): React.ReactElement {
  const kind = classifyAssistantText(props.text);
  const text = formatAssistantText(props.text);
  if (kind === "empty") return <Text dimColor> </Text>;
  if (kind === "interrupted") {
    return (
      <MessageResponse tone="warning" height={1}>
        <InterruptedByUser />
      </MessageResponse>
    );
  }
  if (kind === "context-limit") {
    return (
      <MessageResponse tone="warning">
        <Box flexDirection="column">
          <Text color="yellow">context limit reached</Text>
          <Markdown dimColor>{text}</Markdown>
        </Box>
      </MessageResponse>
    );
  }
  if (kind === "provider-error") {
    return (
      <MessageResponse tone="error">
        <Box flexDirection="column">
          <Text color="red">provider error</Text>
          <Markdown dimColor>{text}</Markdown>
        </Box>
      </MessageResponse>
    );
  }
  return <Markdown>{text}</Markdown>;
}

export function classifyAssistantText(text: string): AssistantTextKind {
  const normalized = formatAssistantText(text);
  if (!normalized) return "empty";
  if (/^(interrupted|aborted|cancelled by user)/i.test(normalized)) return "interrupted";
  if (/\b(context limit|context window|prompt too long|max(?:imum)? tokens?)\b/i.test(normalized)) {
    return "context-limit";
  }
  if (/^(api error|provider error|deepseek error|error:|failed\b)/i.test(normalized)) {
    return "provider-error";
  }
  return "normal";
}

export function formatAssistantText(text: string): string {
  return (text || "").trim();
}
