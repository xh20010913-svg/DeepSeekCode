import React from "react";
import { Box, Text } from "ink";
import { CtrlOToExpand } from "./CtrlOToExpand.js";
import { MessageResponse } from "./MessageResponse.js";

export interface SystemAPIErrorMessageModel {
  title: string;
  body: string;
  truncated: boolean;
  retry: string | null;
}

const MAX_API_ERROR_CHARS = 1000;

export function SystemAPIErrorMessage(props: {
  error: unknown;
  retryAttempt?: number;
  retryInMs?: number;
  maxRetries?: number;
  verbose?: boolean;
}): React.ReactElement {
  const model = systemAPIErrorMessageModel(props);
  return (
    <MessageResponse tone="error">
      <Box flexDirection="column">
        <Text color="red">{model.title}</Text>
        <Text color="red">{model.body}</Text>
        {model.truncated && <CtrlOToExpand />}
        {model.retry && <Text color="gray">{model.retry}</Text>}
      </Box>
    </MessageResponse>
  );
}

export function systemAPIErrorMessageModel(input: {
  error: unknown;
  retryAttempt?: number;
  retryInMs?: number;
  maxRetries?: number;
  verbose?: boolean;
}): SystemAPIErrorMessageModel {
  const formatted = formatAPIError(input.error);
  const truncated = !input.verbose && formatted.length > MAX_API_ERROR_CHARS;
  return {
    title: "DeepSeek API error",
    body: truncated ? `${formatted.slice(0, MAX_API_ERROR_CHARS)}...` : formatted,
    truncated,
    retry: retryText(input.retryAttempt, input.retryInMs, input.maxRetries),
  };
}

export function formatAPIError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function retryText(
  retryAttempt: number | undefined,
  retryInMs: number | undefined,
  maxRetries: number | undefined,
): string | null {
  if (!retryAttempt || !retryInMs || !maxRetries) return null;
  const seconds = Math.max(0, Math.round(retryInMs / 1000));
  const unit = seconds === 1 ? "second" : "seconds";
  return `retrying in ${seconds} ${unit} (attempt ${retryAttempt}/${maxRetries})`;
}
