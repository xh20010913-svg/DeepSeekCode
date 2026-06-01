import React from "react";
import { Box, Text } from "ink";
import { ApprovalResultBlock, parseApprovalResultMessage } from "./ApprovalResultBlock.js";
import { FileEditResultBlock } from "./FileEditResultBlock.js";
import { fileEditResultModel } from "./FileEditResultBlock.js";
import { FileToolResultBlock } from "./FileToolResultBlock.js";
import { parseFileToolResultMessage } from "./FileToolResultBlock.js";
import type { MessageTone } from "./MessageResponse.js";
import { Markdown } from "./Markdown.js";
import { ShellResultBlock } from "./ShellResultBlock.js";
import { parseShellResultMessage } from "./ShellResultBlock.js";
import { StructuredDiff, isUnifiedDiff } from "./StructuredDiff.js";
import { toneColor } from "./design/terminalTheme.js";

export interface ToolResultDetailInfo {
  action: string;
  status: string;
  target?: string;
  message?: string;
}

const KNOWN_STATUSES = new Set([
  "approved",
  "blocked",
  "cancelled",
  "canceled",
  "completed",
  "denied",
  "done",
  "error",
  "failed",
  "ok",
  "paused",
  "rejected",
  "skipped",
  "started",
  "succeeded",
  "warning",
]);

export function ToolResultDetail(props: {
  title: string;
  body: string;
  tone: MessageTone;
}): React.ReactElement | null {
  if (!props.body) return null;
  if (isUnifiedDiff(props.body)) return <StructuredDiff diff={props.body} maxLines={120} />;
  if (parseApprovalResultMessage(props.body)) return <ApprovalResultBlock message={props.body} />;
  if (isQuestionAwaitingUserMessage(props.body)) {
    return <Markdown dimColor>{formatQuestionAwaitingUserMessage(props.body)}</Markdown>;
  }

  const detail = parseToolResultDetail(props.title, props.body);
  if (!detail) return <Markdown dimColor>{props.body}</Markdown>;

  return (
    <Box flexDirection="column">
      <ToolDetailRow label="action" value={detail.action} />
      <ToolDetailRow label="status" value={detail.status} color={toneColor(props.tone) ?? "gray"} />
      {detail.target ? <ToolDetailRow label="target" value={detail.target} /> : null}
      {renderToolMessage(detail, props.tone)}
    </Box>
  );
}

export function parseToolResultDetail(title: string, body = ""): ToolResultDetailInfo | null {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const [action, rawStatus, ...targetParts] = parts;
  const status = rawStatus.toLowerCase();
  if (!/^[a-zA-Z0-9_.:-]+$/.test(action)) return null;
  if (!KNOWN_STATUSES.has(status)) return null;

  const target = normalizeToolResultTarget(action, targetParts.join(" ").trim());
  const message = normalizeToolResultMessage(action, body.trim());
  return {
    action,
    status,
    ...(target ? { target } : {}),
    ...(message ? { message } : {}),
  };
}

function ToolDetailRow(props: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(7)} </Text>
      <Text color={props.color}>{props.value}</Text>
    </Box>
  );
}

function renderToolMessage(detail: ToolResultDetailInfo, tone: MessageTone): React.ReactElement | null {
  if (parseApprovalResultMessage(detail.message ?? "")) {
    return <ApprovalResultBlock message={detail.message ?? ""} />;
  }

  if (fileEditResultModel(detail.action, detail.message ?? "")) {
    return <FileEditResultBlock action={detail.action} message={detail.message} />;
  }

  if (detail.action === "run_command" || detail.action === "ssh_run") {
    if (parseShellResultMessage(detail.message ?? "")) {
      return <ShellResultBlock message={detail.message ?? ""} tone={tone} />;
    }
  }

  if (parseFileToolResultMessage(detail.action, detail.message ?? "")) {
    return <FileToolResultBlock action={detail.action} message={detail.message ?? ""} />;
  }
  if (!detail.message) return null;
  return <Markdown dimColor>{detail.message ?? ""}</Markdown>;
}

export function isQuestionAwaitingUserMessage(message: string): boolean {
  return /^Question awaiting user answer\./i.test(message.trim());
}

export function formatQuestionAwaitingUserMessage(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !/^Question awaiting user answer\./i.test(line.trim()))
    .filter((line) => !/^pending question$/i.test(line.trim()));
  return lines.join("\n").trim() || "Waiting for your answer in the permission panel.";
}

function normalizeToolResultTarget(action: string, target: string): string {
  if ((action === "EnterPlanMode" || action === "ExitPlanMode") && isInternalPlanPath(target)) return "";
  return target;
}

function normalizeToolResultMessage(action: string, message: string): string {
  if (action !== "EnterPlanMode" && action !== "ExitPlanMode") return message;
  return message
    .split(/\r?\n/)
    .filter((line) => !/^plan=\.deepseekcode[\\/]+plans[\\/]+/i.test(line.trim()))
    .join("\n")
    .trim();
}

function isInternalPlanPath(value: string): boolean {
  return /^\.deepseekcode[\\/]+plans[\\/]+run_[^\\/]+\.md$/i.test(value.trim());
}
