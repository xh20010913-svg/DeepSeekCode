import React from "react";
import { Box, Text } from "ink";
import { MessageResponse } from "./MessageResponse.js";

export interface RateLimitMessageModel {
  title: string;
  text: string;
  recommendation: string;
}

export function RateLimitMessage(props: {
  text: string;
}): React.ReactElement {
  const model = rateLimitMessageModel(props.text);
  return (
    <MessageResponse tone="error">
      <Box flexDirection="column">
        <Text color="red">{model.title}</Text>
        <Text color="gray">{model.text}</Text>
        <Text color="gray">{model.recommendation}</Text>
      </Box>
    </MessageResponse>
  );
}

export function rateLimitMessageModel(text: string): RateLimitMessageModel {
  return {
    title: "DeepSeek rate limit",
    text: text.trim() || "The provider refused this request because a rate limit was reached.",
    recommendation: "wait, use deepseek-v4-flash for tests, and run /cache plan before retrying large context",
  };
}

export function isRateLimitText(text: string): boolean {
  return /\b(429|rate limit|too many requests|quota|insufficient balance)\b/i.test(text);
}
