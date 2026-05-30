import React from "react";
import { Box, Text } from "ink";

const DEFAULT_MAX_USER_PROMPT_CHARS = 10_000;
const DEFAULT_USER_PROMPT_HEAD_CHARS = 2_500;
const DEFAULT_USER_PROMPT_TAIL_CHARS = 2_500;

export type PromptSegmentKind = "text" | "command" | "mention";

export interface PromptSegment {
  kind: PromptSegmentKind;
  text: string;
}

export function UserPromptMessage(props: {
  text: string;
}): React.ReactElement {
  const displayText = formatUserPromptText(props.text);
  const lines = displayText.split(/\r?\n/);
  return (
    <Box flexDirection="column">
      {lines.map((line, lineIndex) => (
        <Text key={`${lineIndex}:${line.slice(0, 24)}`}>
          {splitPromptSegments(line || " ").map((segment, segmentIndex) => (
            <Text
              key={`${segmentIndex}:${segment.kind}:${segment.text.slice(0, 16)}`}
              bold={segment.kind === "command"}
              color={promptSegmentColor(segment.kind)}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}

export function formatUserPromptText(
  text: string,
  options: {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
  } = {},
): string {
  const value = text || " ";
  const maxChars = options.maxChars ?? DEFAULT_MAX_USER_PROMPT_CHARS;
  if (value.length <= maxChars) return value;
  const headChars = Math.max(1, options.headChars ?? DEFAULT_USER_PROMPT_HEAD_CHARS);
  const tailChars = Math.max(1, options.tailChars ?? DEFAULT_USER_PROMPT_TAIL_CHARS);
  const head = value.slice(0, headChars);
  const tail = value.slice(-tailChars);
  const hidden = value.slice(headChars, Math.max(headChars, value.length - tailChars));
  const hiddenLines = countNewlines(hidden);
  const lineLabel = hiddenLines === 1 ? "line" : "lines";
  return `${head}\n... +${hiddenLines} hidden ${lineLabel} ...\n${tail}`;
}

export function splitPromptSegments(line: string): PromptSegment[] {
  const segments: PromptSegment[] = [];
  const pattern = /(^|\s)(\/[A-Za-z][\w-]*|@[^\s]+)/g;
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = match[1] ?? "";
    const token = match[2] ?? "";
    const tokenStart = index + prefix.length;
    if (tokenStart > cursor) {
      segments.push({ kind: "text", text: line.slice(cursor, tokenStart) });
    }
    segments.push({ kind: token.startsWith("/") ? "command" : "mention", text: token });
    cursor = tokenStart + token.length;
  }
  if (cursor < line.length) {
    segments.push({ kind: "text", text: line.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", text: line }];
}

function promptSegmentColor(kind: PromptSegmentKind): string | undefined {
  if (kind === "command") return "yellow";
  if (kind === "mention") return "cyan";
  return undefined;
}

function countNewlines(value: string): number {
  return (value.match(/\n/g) ?? []).length;
}
