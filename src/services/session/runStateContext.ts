import type { EventRecord, RunRecord, StateStore, TaskRecord } from "../../state/sqlite.js";
import { AgentWorkflowService } from "../agents/agentWorkflow.js";
import { sanitizeLegacyPlannerContext } from "./legacyContextSanitizer.js";

export interface RunStateContextOptions {
  maxRuns?: number;
  maxChars?: number;
  nowMs?: number;
}

interface TraceShape {
  tasks?: TaskRecord[];
  actions?: Array<{
    step_index?: number;
    action_type?: string;
    status?: string;
    path?: string | null;
    message?: string | null;
    artifact_kind?: string | null;
  }>;
  artifacts?: Array<{
    kind?: string;
    path?: string;
  }>;
  events?: EventRecord[];
}

const DEFAULT_MAX_RUNS = 4;
const DEFAULT_MAX_CHARS = 6_000;
const FRESH_EMPTY_RUN_MS = 5_000;

export function buildRunStateContext(
  state: StateStore,
  projectPath: string,
  options: RunStateContextOptions = {},
): string {
  const maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const nowMs = options.nowMs ?? Date.now();
  const runs = selectRuns(state, projectPath, maxRuns, nowMs);
  if (runs.length === 0) return "";

  const lines: string[] = [
    "runtime_run_state v1",
    "Durable local run/task state. Prefer this over guessing from old chat when continuing or repairing work.",
  ];

  const workflow = activeWorkflowContext(state, projectPath);
  if (workflow) {
    lines.push("");
    lines.push(workflow);
  }

  for (const run of runs) {
    const trace = safeTrace(state, run.id);
    lines.push("");
    lines.push([
      `run ${run.id}`,
      `status=${run.status}`,
      `actions=${run.actionCount}`,
      `artifacts=${run.artifactCount}`,
      `events=${run.eventCount}`,
      `cache_hit=${run.cacheHitTokens ?? 0}`,
      `cache_miss=${run.cacheMissTokens ?? 0}`,
    ].join(" "));
    if (run.message.trim()) lines.push(`message: ${compact(oneLine(sanitizeLegacyPlannerContext(run.message)), 260)}`);

    const tasks = (trace.tasks ?? []).slice(0, 8);
    if (tasks.length > 0) {
      lines.push("tasks:");
      for (const task of tasks) {
        lines.push(`- ${task.agent}/${task.status}: ${compact(oneLine([task.title, task.detail].filter(Boolean).join(" - ")), 240)}`);
      }
    }

    const actions = (trace.actions ?? []).slice(-10);
    if (actions.length > 0) {
      lines.push("recent_actions:");
      for (const action of actions) {
        const actionType = sanitizeLegacyPlannerContext(action.action_type ?? "action");
        const message = action.message ? sanitizeLegacyPlannerContext(action.message) : "";
        lines.push(`- ${actionType} ${action.status ?? "unknown"}${action.path ? ` path=${normalizePath(action.path)}` : ""}${action.artifact_kind ? ` artifact=${action.artifact_kind}` : ""}${message ? ` message=${compact(oneLine(message), 220)}` : ""}`);
      }
    }

    const artifacts = unique((trace.artifacts ?? []).map((artifact) =>
      artifact.path ? `${artifact.kind ?? "artifact"}:${normalizePath(artifact.path)}` : "",
    ).filter(Boolean)).slice(-8);
    if (artifacts.length > 0) {
      lines.push(`artifacts: ${artifacts.join(", ")}`);
    }

    const approvals = state.listApprovalGates({ runId: run.id }, 8)
      .filter((gate) => gate.status !== "approved");
    const validations = state.listValidationGates({ runId: run.id }, 8)
      .filter((gate) => gate.status !== "passed");
    const gateLines = [
      ...approvals.map((gate) => `approval/${gate.status} ${gate.subjectType}:${compact(oneLine(gate.summary), 140)}`),
      ...validations.map((gate) => `validation/${gate.status} ${gate.subjectType}:${compact(oneLine(gate.summary), 140)}`),
    ];
    if (gateLines.length > 0) {
      lines.push("open_or_failed_gates:");
      for (const gate of gateLines.slice(0, 8)) lines.push(`- ${gate}`);
    }

    const importantEvents = (trace.events ?? [])
      .filter((event) => isImportantEvent(event.kind))
      .slice(0, 8);
    if (importantEvents.length > 0) {
      lines.push("recent_events:");
      for (const event of importantEvents) {
        const kind = sanitizeLegacyPlannerContext(event.kind);
        const payload = sanitizeLegacyPlannerContext(stringifyPayload(event.payload));
        lines.push(`- ${kind}: ${compact(oneLine(payload), 260)}`);
      }
    }
  }

  return compact(lines.join("\n"), maxChars);
}

function activeWorkflowContext(state: StateStore, projectPath: string): string | undefined {
  try {
    const status = new AgentWorkflowService(state, projectPath).status();
    const record = status.record;
    if (["succeeded", "failed", "cancelled"].includes(record.status)) return undefined;
    const messages = status.messages.slice(-5)
      .map((message) => `- ${message.from}->${message.to}: ${compact(oneLine(sanitizeLegacyPlannerContext(message.message)), 180)}`);
    const roles = record.roles.map((role) => [
      `- ${role.role} status=${role.status}`,
      role.assignedTasks.length ? `assigned=${compact(oneLine(role.assignedTasks.join(" | ")), 160)}` : "",
      role.checkpoint ? `checkpoint=${compact(oneLine(sanitizeLegacyPlannerContext(role.checkpoint)), 180)}` : "",
      role.blockedBy ? `blocked=${compact(oneLine(sanitizeLegacyPlannerContext(role.blockedBy)), 160)}` : "",
      role.toolResultSummary.length ? `tools=${compact(oneLine(role.toolResultSummary.slice(-2).join(" | ")), 180)}` : "",
    ].filter(Boolean).join(" "));
    const subtasks = record.subtaskGraph.slice(0, 12).map((subtask) => [
      `- ${subtask.id} status=${subtask.status}`,
      `role=${subtask.assigneeRole}`,
      `title=${compact(oneLine(sanitizeLegacyPlannerContext(subtask.title)), 140)}`,
      subtask.evidence.length ? `evidence=${compact(oneLine(subtask.evidence.slice(-2).join(" | ")), 160)}` : "",
      subtask.blockedBy ? `blocked=${compact(oneLine(sanitizeLegacyPlannerContext(subtask.blockedBy)), 140)}` : "",
    ].filter(Boolean).join(" "));
    const skills = record.generatedSkills.slice(0, 10)
      .map((skill) => `- ${skill.role}: ${compact(oneLine(sanitizeLegacyPlannerContext(skill.summary)), 160)}`);
    return [
      `active_workflow ${record.id} run=${record.runId} status=${record.status} phase=${record.phase} approval=${record.approvalState.status}`,
      `objective: ${compact(oneLine(sanitizeLegacyPlannerContext(record.objective)), 260)}`,
      record.contract?.expectedOutputs.length
        ? `contract_outputs: ${record.contract.expectedOutputs.map((output) => `${output.kind}:${compact(oneLine(output.description), 80)}`).join(" | ")}`
        : "",
      record.phase === "awaiting_approval"
        ? "plan_gate: waiting for user command approve_agent_workflow_plan / revise_agent_workflow_plan / regenerate_agent_workflow_plan / cancel_agent_workflow_plan"
        : "",
      "workflow_roles:",
      ...roles,
      subtasks.length ? "workflow_subtasks:" : "",
      ...subtasks,
      skills.length ? "workflow_local_skills:" : "",
      ...skills,
      messages.length ? "workflow_messages:" : "",
      ...messages,
    ].filter(Boolean).join("\n");
  } catch {
    return undefined;
  }
}

function selectRuns(state: StateStore, projectPath: string, maxRuns: number, nowMs: number): RunRecord[] {
  const selected: RunRecord[] = [];
  const seen = new Set<string>();
  for (const run of state.listUnfinishedRuns(projectPath, maxRuns)) {
    if (seen.has(run.id)) continue;
    if (isFreshEmptyCurrentRun(run, nowMs)) continue;
    seen.add(run.id);
    selected.push(run);
    if (selected.length >= maxRuns) break;
  }
  return selected;
}

function isFreshEmptyCurrentRun(run: RunRecord, nowMs: number): boolean {
  return run.status === "running"
    && run.actionCount === 0
    && run.artifactCount === 0
    && run.eventCount <= 1
    && nowMs - run.createdAtMs < FRESH_EMPTY_RUN_MS;
}

function safeTrace(state: StateStore, runId: string): TraceShape {
  try {
    const trace = state.traceRun(runId);
    return trace && typeof trace === "object" ? trace as TraceShape : {};
  } catch {
    return {};
  }
}

function isImportantEvent(kind: string): boolean {
  return /failed|retry|paused|cancel|checkpoint|summary|gate|decision|batch_continue|no_progress|session_context_loaded|tool_result_summary/i.test(kind);
}

function stringifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function compact(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
