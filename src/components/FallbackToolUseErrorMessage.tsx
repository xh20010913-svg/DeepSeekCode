import React from "react";
import { Box, Text } from "ink";
import { CtrlOToExpand } from "./CtrlOToExpand.js";
import { MessageResponse } from "./MessageResponse.js";

const MAX_RENDERED_LINES = 10;

export interface FallbackToolUseErrorModel {
  body: string;
  hiddenLines: number;
}

export function FallbackToolUseErrorMessage(props: {
  result: unknown;
  verbose?: boolean;
}): React.ReactElement {
  const model = fallbackToolUseErrorModel(props.result, Boolean(props.verbose));
  return (
    <MessageResponse tone="error">
      <Box flexDirection="column">
        <Text color="red">{model.body}</Text>
        {model.hiddenLines > 0 ? (
          <Box>
            <Text dimColor>{`... +${model.hiddenLines} ${model.hiddenLines === 1 ? "line" : "lines"} `}</Text>
            <CtrlOToExpand />
          </Box>
        ) : null}
      </Box>
    </MessageResponse>
  );
}

export function fallbackToolUseErrorModel(
  result: unknown,
  verbose = false,
  maxRenderedLines = MAX_RENDERED_LINES,
): FallbackToolUseErrorModel {
  const error = normalizeToolUseError(result, verbose);
  const lines = error.split(/\r?\n/);
  const visible = verbose ? lines : lines.slice(0, maxRenderedLines);
  return {
    body: visible.join("\n"),
    hiddenLines: verbose ? 0 : Math.max(0, lines.length - visible.length),
  };
}

export function isFallbackToolUseErrorText(text: string): boolean {
  return /<tool_use_error>|<\/?error>|InputValidationError:|tool execution failed/i.test(text);
}

function normalizeToolUseError(result: unknown, verbose: boolean): string {
  if (typeof result !== "string") return "Tool execution failed";
  const extracted = extractTaggedContent(result, "tool_use_error") ?? result;
  const withoutSandbox = extracted.replace(/<sandbox_violation[\s\S]*?<\/sandbox_violation>/gi, "");
  const withoutTags = withoutSandbox
    .replace(/<\/?error>/gi, "")
    .replace(/<\/?tool_use_error>/gi, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim();

  if (!verbose && withoutTags.includes("InputValidationError: ")) {
    return "Invalid tool parameters";
  }
  if (!withoutTags) return "Tool execution failed";
  if (/^(Error|Cancelled):\s/i.test(withoutTags)) return withoutTags;
  return `Error: ${withoutTags}`;
}

function extractTaggedContent(text: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  return pattern.exec(text)?.[1];
}
