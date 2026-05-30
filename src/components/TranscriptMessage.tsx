import React from "react";
import { AssistantTextMessage, formatAssistantText } from "./AssistantTextMessage.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { Markdown } from "./Markdown.js";
import { MessageRow, type MessageRowMeta } from "./MessageRow.js";
import type { MessageTimestampValue } from "./MessageTimestamp.js";
import { RateLimitMessage, isRateLimitText } from "./RateLimitMessage.js";
import { SystemAPIErrorMessage } from "./SystemAPIErrorMessage.js";
import { SystemTextMessage, formatSystemText } from "./SystemTextMessage.js";
import { ThinkingMessage, formatThinkingPreview } from "./ThinkingMessage.js";
import { ToolResultMessage } from "./ToolResultMessage.js";
import { ToolStartMessage } from "./ToolStartMessage.js";
import { UserPromptMessage, formatUserPromptText } from "./UserPromptMessage.js";

export type TranscriptRole = "user" | "assistant" | "system" | "error" | "tool" | "tool-start" | "display" | "thinking";

export interface TranscriptMessageItem {
  role: TranscriptRole;
  text: string;
  timestamp?: MessageTimestampValue;
  model?: string;
  streaming?: boolean;
}

export interface TranscriptRoleMeta extends MessageRowMeta {}

const DEFAULT_MAX_TRANSCRIPT_CHARS = 10_000;
const DEFAULT_TRANSCRIPT_HEAD_CHARS = 2_500;
const DEFAULT_TRANSCRIPT_TAIL_CHARS = 2_500;

export function TranscriptMessage(props: {
  item: TranscriptMessageItem;
  width?: number;
}): React.ReactElement {
  const meta = transcriptRoleMeta(props.item.role);
  const text = formatTranscriptText(props.item);
  const metadata = hasTranscriptMetadata(props.item);
  return (
    <MessageRow
      meta={meta}
      metadata={metadata ? props.item : undefined}
      isToolLike={isToolLikeRole(props.item.role)}
      width={props.width}
    >
      {props.item.role === "tool-start" ? (
        <ToolStartMessage text={text} />
      ) : props.item.role === "tool" ? (
        <ToolResultMessage text={text} />
      ) : props.item.role === "thinking" ? (
        <ThinkingMessage text={text} />
      ) : props.item.role === "system" ? (
        <SystemTextMessage text={text} />
      ) : props.item.role === "user" ? (
        <UserPromptMessage text={text} />
      ) : props.item.role === "assistant" ? (
        <AssistantTextMessage text={text} />
      ) : props.item.role === "error" && isRateLimitText(text) ? (
        <RateLimitMessage text={text} />
      ) : props.item.role === "error" ? (
        <SystemAPIErrorMessage error={text} />
      ) : (
        <Markdown dimColor={meta.dimBody}>
          {text}
        </Markdown>
      )}
    </MessageRow>
  );
}

export function transcriptRoleMeta(role: TranscriptRole): TranscriptRoleMeta {
  if (role === "user") return { label: "You", tone: "brand" };
  if (role === "assistant") return { label: "DeepSeekCode", tone: "success" };
  if (role === "tool-start") return { label: "tool", tone: "warning", dimBody: true };
  if (role === "tool") return { label: "tool", tone: "warning" };
  if (role === "thinking") return { label: "thinking", tone: "muted", dimBody: true };
  if (role === "error") return { label: "error", tone: "error" };
  if (role === "display") return { label: "display", tone: "muted", dimBody: true };
  return { label: "system", tone: "muted", dimBody: true };
}

export function estimateTranscriptRows(item: TranscriptMessageItem): number {
  const textRows = formatTranscriptText(item).split(/\r?\n/).length;
  return 1 + textRows + (isToolLikeRole(item.role) ? 0 : 1) + (hasTranscriptMetadata(item) ? 1 : 0);
}

export function formatTranscriptText(item: TranscriptMessageItem): string {
  const text = item.text || " ";
  if (item.role === "user") return formatUserPromptText(text);
  if (item.role === "assistant") return formatAssistantText(truncateTranscriptText(text));
  if (item.role === "system") return formatSystemText(text);
  if (item.role === "thinking") return formatThinkingPreview(text);
  if (isToolLikeRole(item.role)) return text.trim() || "tool result";
  return truncateTranscriptText(text);
}

function isToolLikeRole(role: TranscriptRole): boolean {
  return role === "tool" || role === "tool-start";
}

export function hasTranscriptMetadata(item: TranscriptMessageItem): boolean {
  return item.role === "assistant" && Boolean(item.timestamp || item.model || item.streaming);
}

export function truncateTranscriptText(
  text: string,
  options: {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
  } = {},
): string {
  const maxChars = options.maxChars ?? DEFAULT_MAX_TRANSCRIPT_CHARS;
  if (text.length <= maxChars) return text;
  const headChars = Math.max(1, options.headChars ?? DEFAULT_TRANSCRIPT_HEAD_CHARS);
  const tailChars = Math.max(1, options.tailChars ?? DEFAULT_TRANSCRIPT_TAIL_CHARS);
  const head = text.slice(0, headChars);
  const tail = text.slice(-tailChars);
  const hidden = text.slice(headChars, Math.max(headChars, text.length - tailChars));
  const hiddenLines = countNewlines(hidden);
  const lineLabel = hiddenLines === 1 ? "line" : "lines";
  return `${head}\n... +${hiddenLines} hidden ${lineLabel} ...\n${tail}`;
}

function countNewlines(value: string): number {
  return (value.match(/\n/g) ?? []).length;
}
