import type { ActionExecutionReport } from "../../protocol/actions.js";
import type { TaskCompletionContract } from "../agents/agentWorkflow.js";
import type { StateStore } from "../../state/sqlite.js";
import type { ProviderPromptPlanInput, ProviderPromptPlan } from "../context/promptBudgetGovernor.js";
import { planProviderPrompt } from "../context/promptBudgetGovernor.js";
import { EvidenceStore, type AgentEvidenceRecord } from "./evidenceStore.js";

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

export interface AgentKernelSpan {
  spanId: string;
  runId: string;
  parentSpanId?: string;
  workflowId?: string;
  role?: string;
  subtaskId?: string;
  toolCallId?: string;
  stage: AgentKernelStage;
  status: "started" | "succeeded" | "failed" | "paused";
  summary: string;
  budgetPlanId?: string;
  evidenceId?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  details?: Record<string, unknown>;
}

export interface AgentKernelBudgetPlanRecord {
  budgetPlanId?: string;
  stableHash: string;
  dynamicHash: string;
  dynamicChars: number;
  maxDynamicChars: number;
  dynamicShare?: number;
  droppedChars?: number;
  droppedBlocks?: number | string[];
  blocks?: Array<{ title: string; priority: string; chars: number; truncated: boolean; originalChars?: number }>;
  diagnostics?: {
    shouldCompact?: boolean;
    recommendations?: string[];
  } & Record<string, unknown>;
}

export class AgentKernel {
  readonly evidence: EvidenceStore;

  constructor(private readonly state: StateStore) {
    this.evidence = new EvidenceStore(state);
  }

  record(event: AgentKernelEvent): void {
    this.state.appendEvent(event.runId, "agent_kernel_stage", {
      stage: event.stage,
      status: event.status,
      summary: event.summary,
      ...(event.details ?? {}),
    });
  }

  recordSpan(span: AgentKernelSpan): void {
    this.state.appendEvent(span.runId, "agent_kernel_span", {
      ...span,
      startedAtMs: span.startedAtMs ?? Date.now(),
    });
  }

  recordBudgetPlan(runId: string, plan: AgentKernelBudgetPlanRecord | any, source: string): void {
    this.state.appendEvent(runId, "agent_kernel_budget_plan", {
      source,
      budgetPlanId: plan.budgetPlanId ?? `${plan.stableHash}:${plan.dynamicHash}:${source}`,
      stable_hash: plan.stableHash,
      dynamic_hash: plan.dynamicHash,
      dynamic_chars: plan.dynamicChars,
      max_dynamic_chars: plan.maxDynamicChars,
      dynamic_share: plan.dynamicShare ?? 0,
      dropped_chars: plan.droppedChars ?? 0,
      dropped_blocks: Array.isArray(plan.droppedBlocks)
        ? plan.droppedBlocks.length
        : plan.droppedBlocks ?? plan.blocks?.filter((block: { truncated?: boolean }) => block.truncated).length ?? 0,
      should_compact: Boolean(plan.diagnostics?.shouldCompact),
      recommendations: plan.diagnostics?.recommendations ?? [],
    });
  }

  planProviderCall(input: ProviderPromptPlanInput): ProviderPromptPlan {
    const planned = planProviderPrompt(input);
    if (input.runId) this.recordBudgetPlan(input.runId, planned.plan, input.callSite ?? input.phase ?? "provider_call");
    return planned;
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
    this.evidence.record(evidence);
  }

  recordToolEvidence(
    runId: string,
    report: ActionExecutionReport,
    context: { workflowId?: string; role?: string; subtaskId?: string; toolCallIdPrefix?: string } = {},
  ): void {
    this.evidence.recordToolReport({
      runId,
      report,
      workflowId: context.workflowId,
      role: context.role,
      subtaskId: context.subtaskId,
      toolCallIdPrefix: context.toolCallIdPrefix,
    });
  }
}
