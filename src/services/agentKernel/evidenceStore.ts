import type { ActionExecutionReport, ActionResult } from "../../protocol/actions.js";
import type { EventRecord, StateStore } from "../../state/sqlite.js";

export type AgentEvidenceKind =
  | "file"
  | "url"
  | "screenshot"
  | "command"
  | "pdf"
  | "office"
  | "mcp"
  | "process"
  | "validation"
  | "manual"
  | string;

export interface AgentEvidenceRecord {
  evidenceId: string;
  runId: string;
  workflowId?: string;
  role?: string;
  subtaskId?: string;
  toolCallId?: string;
  kind: AgentEvidenceKind;
  status?: "succeeded" | "failed" | "warning" | "skipped";
  summary: string;
  path?: string;
  url?: string;
  artifactKind?: string;
  createdAtMs?: number;
  metadata?: Record<string, unknown>;
}

export interface RunAttachmentRecord {
  attachmentId: string;
  runId: string;
  evidenceId?: string;
  kind: string;
  path?: string;
  url?: string;
  summary: string;
  createdAtMs?: number;
  metadata?: Record<string, unknown>;
}

export class EvidenceStore {
  constructor(private readonly state: StateStore) {}

  record(evidence: AgentEvidenceRecord): AgentEvidenceRecord {
    const record = {
      ...evidence,
      createdAtMs: evidence.createdAtMs ?? Date.now(),
    };
    this.state.appendEvent(record.runId, "agent_kernel_evidence", record);
    return record;
  }

  recordAttachment(attachment: RunAttachmentRecord): RunAttachmentRecord {
    const record = {
      ...attachment,
      createdAtMs: attachment.createdAtMs ?? Date.now(),
    };
    this.state.appendEvent(record.runId, "run_attachment", record);
    return record;
  }

  recordToolReport(input: {
    runId: string;
    workflowId?: string;
    role?: string;
    subtaskId?: string;
    toolCallIdPrefix?: string;
    report: ActionExecutionReport;
  }): AgentEvidenceRecord[] {
    return input.report.results
      .filter((result) => result.status === "succeeded" || result.status === "failed")
      .map((result, index) => this.record(actionResultToEvidence({
        result,
        index,
        runId: input.runId,
        workflowId: input.workflowId,
        role: input.role,
        subtaskId: input.subtaskId,
        toolCallIdPrefix: input.toolCallIdPrefix,
      })));
  }

  list(runId: string, limit = 120): AgentEvidenceRecord[] {
    return this.state.listEvents(runId, limit)
      .filter((event) => event.kind === "agent_kernel_evidence")
      .map((event) => eventToEvidence(event))
      .filter((record): record is AgentEvidenceRecord => Boolean(record));
  }
}

function actionResultToEvidence(input: {
  result: ActionResult;
  index: number;
  runId: string;
  workflowId?: string;
  role?: string;
  subtaskId?: string;
  toolCallIdPrefix?: string;
}): AgentEvidenceRecord {
  return {
    evidenceId: `evidence_${Date.now()}_${input.index}`,
    runId: input.runId,
    workflowId: input.workflowId,
    role: input.role,
    subtaskId: input.subtaskId,
    toolCallId: input.toolCallIdPrefix ? `${input.toolCallIdPrefix}_${input.index}` : undefined,
    kind: evidenceKindForAction(input.result),
    status: input.result.status,
    summary: input.result.message ?? `${input.result.action_type} ${input.result.status}`,
    path: input.result.path,
    artifactKind: input.result.artifact_kind,
    metadata: {
      actionType: input.result.action_type,
      hasContext: Boolean(input.result.context),
    },
  };
}

function eventToEvidence(event: EventRecord): AgentEvidenceRecord | undefined {
  const payload = typeof event.payload === "object" && event.payload !== null
    ? event.payload as Record<string, unknown>
    : undefined;
  if (!payload) return undefined;
  const evidenceId = stringValue(payload.evidenceId);
  const runId = stringValue(payload.runId) ?? event.runId ?? undefined;
  const kind = stringValue(payload.kind);
  const summary = stringValue(payload.summary);
  if (!evidenceId || !runId || !kind || !summary) return undefined;
  return {
    evidenceId,
    runId,
    workflowId: stringValue(payload.workflowId),
    role: stringValue(payload.role),
    subtaskId: stringValue(payload.subtaskId),
    toolCallId: stringValue(payload.toolCallId),
    kind,
    status: statusValue(payload.status),
    summary,
    path: stringValue(payload.path),
    url: stringValue(payload.url),
    artifactKind: stringValue(payload.artifactKind),
    createdAtMs: numberValue(payload.createdAtMs) ?? event.createdAtMs,
    metadata: objectValue(payload.metadata),
  };
}

function evidenceKindForAction(result: ActionResult): AgentEvidenceKind {
  if (result.artifact_kind === "pdf" || result.action_type === "create_pdf") return "pdf";
  if (result.artifact_kind === "screenshot" || result.action_type === "browser_screenshot") return "screenshot";
  if (["docx", "pptx", "xlsx"].includes(result.artifact_kind ?? "")) return "office";
  if (result.action_type === "mcp_call") return "mcp";
  if (result.action_type === "launch_project" || result.action_type === "stop_project_process") return "process";
  if (result.action_type === "run_command") return "command";
  if (result.action_type === "verify_task" || result.action_type === "verify_project" || result.action_type === "validate_artifact") return "validation";
  if (result.path) return "file";
  return result.artifact_kind ?? result.action_type;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statusValue(value: unknown): AgentEvidenceRecord["status"] {
  return value === "succeeded" || value === "failed" || value === "warning" || value === "skipped" ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
