import React from "react";
import { Box, Text } from "ink";
import { ActionSummaryBlock } from "./ActionSummaryBlock.js";
import { ApprovalDecisionOptions } from "./ApprovalDecisionOptions.js";
import { ArtifactApprovalPreviewBlock } from "./ArtifactApprovalPreviewBlock.js";
import { BrowserApprovalPreviewBlock } from "./BrowserApprovalPreviewBlock.js";
import { FileEditReviewPanel } from "./FileEditReviewPanel.js";
import { McpApprovalPreviewBlock } from "./McpApprovalPreviewBlock.js";
import { PermissionRequestFrame } from "./PermissionRequestFrame.js";
import { PlanApprovalPreviewBlock } from "./PlanApprovalPreviewBlock.js";
import { QuestionApprovalPreviewBlock } from "./QuestionApprovalPreviewBlock.js";
import { RemoteFileApprovalPreviewBlock } from "./RemoteFileApprovalPreviewBlock.js";
import { ShellApprovalPreviewBlock } from "./ShellApprovalPreviewBlock.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

export interface ApprovalGateCardModel {
  label: string;
  labelColor: string;
  statusColor: string;
  action: string;
  hint: string;
  summary: string;
}

export function ApprovalGateCard(props: {
  gate: ApprovalGateRecord;
  children?: React.ReactNode;
  projectPath?: string;
  showRun?: boolean;
  selectedDecisionIndex?: number;
}): React.ReactElement {
  const model = approvalGateCardModel(props.gate);
  const { columns } = useTerminalSize();
  const width = Math.max(36, Math.min(100, columns - 4));
  return (
    <PermissionRequestFrame gate={props.gate} width={width}>
      {props.showRun ? <GateRow label="run" value={displayRunLabel(props.gate.runId)} /> : null}
      <GateRow label="action" value={model.action} />
      <GateRow label="summary" value={model.summary} />
      <FileEditReviewPanel
        summary={props.gate.summary}
        projectPath={props.projectPath}
        gateId={props.gate.id}
        width={Math.max(32, width - 6)}
      />
      <ShellApprovalPreviewBlock summary={props.gate.summary} />
      <RemoteFileApprovalPreviewBlock summary={props.gate.summary} width={Math.max(32, width - 6)} />
      <BrowserApprovalPreviewBlock summary={props.gate.summary} width={Math.max(32, width - 6)} />
      <ArtifactApprovalPreviewBlock summary={props.gate.summary} width={Math.max(32, width - 6)} />
      <McpApprovalPreviewBlock summary={props.gate.summary} width={Math.max(32, width - 6)} />
      <QuestionApprovalPreviewBlock
        projectPath={props.projectPath}
        gateId={props.gate.id}
        width={Math.max(32, width - 6)}
      />
      {props.gate.subjectType === "plan" ? (
        <PlanApprovalPreviewBlock
          projectPath={props.projectPath}
          runId={props.gate.runId}
          width={Math.max(32, width - 6)}
        />
      ) : null}
      <ActionSummaryBlock summary={props.gate.summary} />
      <ApprovalDecisionOptions
        gateId={props.gate.id}
        subjectType={props.gate.subjectType}
        status={props.gate.status}
        summary={props.gate.summary}
        gate={props.gate}
        projectPath={props.projectPath}
        selectedIndex={props.selectedDecisionIndex}
      />
      {props.children}
      <GateRow label="hint" value={model.hint} color="gray" />
    </PermissionRequestFrame>
  );
}

export function approvalGateCardModel(gate: ApprovalGateRecord): ApprovalGateCardModel {
  return {
    label: labelForSubject(gate.subjectType),
    labelColor: colorForSubject(gate.subjectType),
    statusColor: colorForStatus(gate.status),
    action: gate.summary.trim().split(/\s+/)[0] || gate.subjectType,
    hint: hintForGate(gate.subjectType, gate.id),
    summary: compactGateSummary(gate.summary),
  };
}

export function hintForGate(subjectType: string, id: string): string {
  void id;
  if (subjectType === "question") return "Choose an answer above; DeepSeekCode will continue after your selection.";
  if (subjectType === "plan") return "Approve to continue, reject to revise, or Esc to cancel.";
  return "Allow once to continue this exact action, or reject it.";
}

export function labelForSubject(subjectType: string): string {
  if (subjectType === "plan") return "plan";
  if (subjectType === "question") return "question";
  if (subjectType === "tool_action" || subjectType === "tool") return "approval";
  return "gate";
}

function colorForSubject(subjectType: string): string {
  if (subjectType === "question") return "cyan";
  if (subjectType === "plan") return "yellow";
  return "magenta";
}

function colorForStatus(status: string): string {
  if (status === "approved") return "green";
  if (status === "pending") return "yellow";
  return "red";
}

function compactGateSummary(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > 180 ? `${singleLine.slice(0, 177)}...` : singleLine;
}

export function displayRunLabel(runId: string): string {
  return /^run_[0-9a-f-]{8,}$/i.test(runId) ? "current run" : runId;
}

function GateRow(props: {
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
