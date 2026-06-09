import type { ActionExecutionReport } from "../../protocol/actions.js";
import type { TaskCompletionContract } from "../agents/agentWorkflow.js";
import type { StateStore } from "../../state/sqlite.js";

export type AgentKernelStage =
  | "intent"
  | "contract"
  | "plan"
  | "execution"
  | "evidence"
  | "verification"
  | "repair"
  | "final";

export interface AgentKernelEvent {
  runId: string;
  stage: AgentKernelStage;
  status: "started" | "succeeded" | "failed" | "paused";
  summary: string;
  details?: Record<string, unknown>;
}

export interface AgentEvidenceRecord {
  evidenceId: string;
  runId: string;
  workflowId?: string;
  role?: string;
  subtaskId?: string;
  toolCallId?: string;
  kind: string;
  summary: string;
  path?: string;
  url?: string;
}

export class AgentKernel {
  constructor(private readonly state: StateStore) {}

  record(event: AgentKernelEvent): void {
    this.state.appendEvent(event.runId, "agent_kernel_stage", {
      stage: event.stage,
      status: event.status,
      summary: event.summary,
      ...(event.details ?? {}),
    });
  }

  recordContract(runId: string, contract: TaskCompletionContract | undefined, source: string): void {
    if (!contract) return;
    this.record({
      runId,
      stage: "contract",
      status: "succeeded",
      summary: contract.objective || "Task contract normalized.",
      details: {
        source,
        expected_outputs: contract.expectedOutputs,
        acceptance_criteria: contract.acceptanceCriteria,
        verification_hints: contract.verificationHints,
      },
    });
  }

  recordEvidence(evidence: AgentEvidenceRecord): void {
    this.state.appendEvent(evidence.runId, "agent_kernel_evidence", evidence);
  }

  recordToolEvidence(runId: string, report: ActionExecutionReport): void {
    report.results
      .filter((result) => result.status === "succeeded" || result.status === "failed")
      .forEach((result, index) => {
        this.recordEvidence({
          evidenceId: `evidence_${Date.now()}_${index}`,
          runId,
          kind: result.artifact_kind ?? result.action_type,
          summary: result.message ?? `${result.action_type} ${result.status}`,
          path: result.path,
        });
      });
  }
}
