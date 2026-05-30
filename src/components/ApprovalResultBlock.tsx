import React from "react";
import { Box, Text } from "ink";
import { ActionSummaryBlock } from "./ActionSummaryBlock.js";
import { ApprovalDecisionOptions } from "./ApprovalDecisionOptions.js";
import { ArtifactApprovalPreviewBlock } from "./ArtifactApprovalPreviewBlock.js";
import { BrowserApprovalPreviewBlock } from "./BrowserApprovalPreviewBlock.js";
import { FileEditPreviewBlock } from "./FileEditPreviewBlock.js";
import { McpApprovalPreviewBlock } from "./McpApprovalPreviewBlock.js";
import { PermissionRequestFrame } from "./PermissionRequestFrame.js";
import { RemoteFileApprovalPreviewBlock } from "./RemoteFileApprovalPreviewBlock.js";
import { ShellApprovalPreviewBlock } from "./ShellApprovalPreviewBlock.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

export interface ApprovalResultModel {
  status: "required" | "approved" | "rejected" | "cancelled";
  gateId: string;
  action: string;
  summary: string;
  hint?: string;
}

export function ApprovalResultBlock(props: {
  message: string;
}): React.ReactElement | null {
  const model = parseApprovalResultMessage(props.message);
  if (!model) return null;
  const { columns } = useTerminalSize();
  const width = Math.max(36, Math.min(100, columns - 6));
  const gate = approvalResultGateRecord(model);
  return (
    <PermissionRequestFrame gate={gate} width={width}>
      <ApprovalResultRow label="action" value={model.action} />
      <ApprovalResultRow label="summary" value={model.summary} />
      <FileEditPreviewBlock summary={model.summary} />
      <ShellApprovalPreviewBlock summary={model.summary} />
      <RemoteFileApprovalPreviewBlock summary={model.summary} />
      <BrowserApprovalPreviewBlock summary={model.summary} />
      <ArtifactApprovalPreviewBlock summary={model.summary} />
      <McpApprovalPreviewBlock summary={model.summary} />
      <ActionSummaryBlock summary={model.summary} />
      <ApprovalDecisionOptions
        gateId={model.gateId}
        subjectType={gate.subjectType}
        status={gate.status}
        summary={model.summary}
      />
      {model.hint ? <ApprovalResultRow label="next" value={model.hint} color="gray" /> : null}
    </PermissionRequestFrame>
  );
}

export function parseApprovalResultMessage(message: string): ApprovalResultModel | null {
  const trimmed = message.trim();
  const required = trimmed.match(/^Approval required:\s+(\S+)\s+(.+)$/i);
  if (required) {
    const gateId = required[1] ?? "";
    const rest = required[2] ?? "";
    const [summary, hint] = splitApprovalHint(rest);
    return {
      status: "required",
      gateId,
      action: approvalActionFromSummary(summary),
      summary,
      ...(hint ? { hint } : {}),
    };
  }

  const decided = trimmed.match(/^Approval\s+(approved|rejected|cancelled|canceled):\s+(\S+)\s+(.+)$/i);
  if (!decided) return null;
  const rawStatus = (decided[1] ?? "").toLowerCase();
  const status = rawStatus === "canceled" ? "cancelled" : rawStatus;
  const summary = decided[3] ?? "";
  return {
    status: status as ApprovalResultModel["status"],
    gateId: decided[2] ?? "",
    action: approvalActionFromSummary(summary),
    summary,
  };
}

function splitApprovalHint(value: string): [string, string | undefined] {
  const marker = ". Run ";
  const index = value.indexOf(marker);
  if (index < 0) return [value.trim(), undefined];
  return [
    value.slice(0, index).trim(),
    `Run ${value.slice(index + marker.length).trim()}`,
  ];
}

function approvalActionFromSummary(summary: string): string {
  return summary.trim().split(/\s+/)[0] || "tool_action";
}

function approvalStatusColor(status: ApprovalResultModel["status"]): string {
  if (status === "required") return "yellow";
  if (status === "approved") return "green";
  return "red";
}

function approvalResultGateRecord(model: ApprovalResultModel): ApprovalGateRecord {
  const status = model.status === "required" ? "pending" : model.status;
  return {
    id: model.gateId,
    runId: "",
    subjectType: subjectTypeForApprovalResult(model.summary),
    subjectId: model.action,
    status,
    summary: model.summary,
    rationale: "",
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

function subjectTypeForApprovalResult(summary: string): string {
  const action = approvalActionFromSummary(summary);
  if (action === "plan") return "plan";
  if (action === "Question") return "question";
  return "tool_action";
}

function ApprovalResultRow(props: {
  label: string;
  value: string;
  color?: string;
}): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Text color="gray">{props.label.padEnd(7)} </Text>
      <Text color={props.color ?? "gray"}>{props.value}</Text>
    </Box>
  );
}
