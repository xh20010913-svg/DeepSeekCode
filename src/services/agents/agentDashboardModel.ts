import path from "node:path";
import type { EventRecord, RunRecord, StateStore, TaskRecord, TaskStatus, ValidationGateRecord } from "../../state/sqlite.js";
import { issueLabel, looksLikeTechnicalIssue, summarizeTechnicalError, type TechnicalErrorSummary } from "../../utils/technicalErrorSummary.js";
import { AgentWorkflowService, type AgentRoleSpec, type AgentWorkflowMessage, type AgentWorkflowRecord } from "./agentWorkflow.js";

export interface AgentDashboardOverview {
  objective: string;
  phase: string;
  status: string;
  elapsedMs: number;
  done: number;
  running: number;
  pending: number;
  failed: number;
  total: number;
  staleReason?: string;
  staleIssue?: TechnicalErrorSummary;
  lastTool?: string;
  estimatedCostUsd?: number;
  cacheHitRate?: number;
}

export interface AgentDashboardRole {
  role: string;
  responsibility: string;
  status: TaskStatus | "defined";
  currentTask?: string;
  assignedTasks: string[];
  completedTasks: string[];
  blockedBy?: string;
  blockedIssue?: TechnicalErrorSummary;
  lastTool?: string;
  lastMessage?: string;
  skills: string[];
  tools: string[];
  acceptance: string[];
}

export interface AgentDashboardTask {
  id: string;
  title: string;
  status: TaskStatus;
  agent: string;
  detail?: string;
  issue?: TechnicalErrorSummary;
  updatedAtMs: number;
}

export interface AgentDashboardTimelineEvent {
  id: string;
  createdAtMs: number;
  kind: string;
  role?: string;
  status?: string;
  task?: string;
  tool?: string;
  message?: string;
  rawMessage?: string;
  issue?: TechnicalErrorSummary;
  artifact?: string;
  parentRunId?: string;
  childRunId?: string;
}

export interface AgentDashboardArtifact {
  kind: string;
  path: string;
  createdAtMs?: number;
  status?: string;
  preview?: string;
}

export interface AgentDashboardValidation {
  status: "passed" | "failed" | "running" | "unknown";
  summary: string;
  failures: string[];
  failureIssues: TechnicalErrorSummary[];
  repaired: string[];
}

export interface AgentDashboardSnapshot {
  run?: RunRecord;
  workflow?: AgentWorkflowRecord;
  generatedAtMs: number;
  projectPath: string;
  overview: AgentDashboardOverview;
  roles: AgentDashboardRole[];
  taskBoard: Record<"queued" | "running" | "needs_review" | "succeeded" | "failed", AgentDashboardTask[]>;
  timeline: AgentDashboardTimelineEvent[];
  artifacts: AgentDashboardArtifact[];
  validation: AgentDashboardValidation;
}

export function buildAgentDashboardSnapshot(input: {
  state: StateStore;
  projectPath: string;
  runId?: string;
}): AgentDashboardSnapshot {
  const activeStatus = activeWorkflowStatus(input.state, input.projectPath);
  const workflowStatus = activeStatus && (!input.runId || input.runId === activeStatus.record.runId)
    ? activeStatus
    : undefined;
  const runId = input.runId ?? workflowStatus?.record.runId ?? latestRunForProject(input.state, input.projectPath)?.id;
  const run = runId ? input.state.getRun(runId) : undefined;
  const tasks = runId ? input.state.listTasks(runId) : [];
  const events = runId ? input.state.listEvents(runId, 160).reverse() : [];
  const validationGates = runId ? input.state.listValidationGates({ runId }, 20).reverse() : [];
  const usage = runId ? input.state.usageTotals(runId) : input.state.usageTotals();
  const artifacts = runId ? readArtifacts(input.state, runId) : [];
  const messages = workflowStatus?.messages ?? [];
  const roles = buildRoles({
    roles: workflowStatus?.record.roles ?? inferRoles(tasks),
    tasks,
    events,
    messages,
  });
  const overview = buildOverview({
    run,
    workflow: workflowStatus?.record,
    tasks,
    events,
    usage,
    projectPath: input.projectPath,
  });
  return {
    run,
    workflow: workflowStatus?.record,
    generatedAtMs: Date.now(),
    projectPath: input.projectPath,
    overview,
    roles,
    taskBoard: buildTaskBoard(tasks),
    timeline: events.slice(-100).map((event) => normalizeTimelineEvent(event)),
    artifacts,
    validation: buildValidation(events, tasks, validationGates),
  };
}

export function serializeAgentTraceJsonl(snapshot: AgentDashboardSnapshot): string {
  return snapshot.timeline
    .map((event) => JSON.stringify({
      role: event.role,
      status: event.status,
      task: event.task,
      tool: event.tool,
      message: event.message,
      issue: event.issue ? {
        category: event.issue.category,
        title: event.issue.title.en,
      } : undefined,
      artifact: event.artifact,
      parentRunId: event.parentRunId ?? snapshot.run?.id,
      childRunId: event.childRunId,
      kind: event.kind,
      createdAtMs: event.createdAtMs,
    }))
    .join("\n");
}

function activeWorkflowStatus(state: StateStore, projectPath: string): {
  record: AgentWorkflowRecord;
  tasks: TaskRecord[];
  messages: AgentWorkflowMessage[];
} | undefined {
  try {
    return new AgentWorkflowService(state, projectPath).status();
  } catch {
    return undefined;
  }
}

function latestRunForProject(state: StateStore, projectPath: string): RunRecord | undefined {
  const normalized = normalizePath(projectPath);
  return state.listRuns(50).find((run) => normalizePath(run.projectPath) === normalized) ?? state.listRuns(1)[0];
}

function inferRoles(tasks: TaskRecord[]): AgentRoleSpec[] {
  const names = [...new Set(tasks.map((task) => task.agent).filter(Boolean))];
  return names.map((name) => ({
    name,
    responsibility: `Handle assigned ${name} work in this run.`,
    skills: [],
    tools: [],
    acceptance: [],
  }));
}

function buildRoles(input: {
  roles: AgentRoleSpec[];
  tasks: TaskRecord[];
  events: EventRecord[];
  messages: AgentWorkflowMessage[];
}): AgentDashboardRole[] {
  return input.roles.map((role) => {
    const tasks = input.tasks.filter((task) => task.agent === role.name);
    const running = tasks.find((task) => task.status === "running");
    const blockedIssue = blockedIssueFor(role.name, tasks, input.events);
    const latestMessage = input.messages
      .filter((message) => message.from === role.name || message.to === role.name || message.to === "all")
      .at(-1);
    return {
      role: role.name,
      responsibility: role.responsibility,
      status: roleStatus(tasks),
      currentTask: running?.title,
      assignedTasks: tasks.map((task) => task.title),
      completedTasks: tasks.filter((task) => task.status === "succeeded").map((task) => evidenceForTask(task)),
      blockedBy: blockedIssue ? issueLabel(blockedIssue, "zh") : undefined,
      blockedIssue,
      lastTool: latestToolForRole(role.name, input.events),
      lastMessage: latestMessage ? `${latestMessage.from} -> ${latestMessage.to}: ${compact(latestMessage.message, 180)}` : undefined,
      skills: role.skills,
      tools: role.tools,
      acceptance: role.acceptance,
    };
  });
}

function roleStatus(tasks: TaskRecord[]): AgentDashboardRole["status"] {
  if (tasks.length === 0) return "defined";
  if (tasks.some((task) => task.status === "failed")) return "failed";
  if (tasks.some((task) => task.status === "running")) return "running";
  if (tasks.some((task) => task.status === "paused")) return "paused";
  if (tasks.every((task) => task.status === "succeeded")) return "succeeded";
  if (tasks.some((task) => task.status === "cancelled")) return "cancelled";
  return "queued";
}

function buildTaskBoard(tasks: TaskRecord[]): AgentDashboardSnapshot["taskBoard"] {
  const empty: AgentDashboardSnapshot["taskBoard"] = {
    queued: [],
    running: [],
    needs_review: [],
    succeeded: [],
    failed: [],
  };
  for (const task of tasks) {
    const issue = issueFromTask(task);
    const item: AgentDashboardTask = {
      id: task.id,
      title: task.title,
      status: task.status,
      agent: task.agent,
      detail: issue ? issueLabel(issue, "zh") : task.detail,
      issue,
      updatedAtMs: task.updatedAtMs,
    };
    if (task.status === "succeeded") empty.succeeded.push(item);
    else if (task.status === "failed" || task.status === "cancelled") empty.failed.push(item);
    else if (task.status === "running") empty.running.push(item);
    else if (/review|验收|审查|validate|acceptance/i.test(task.agent) || /review|验收|审查|validate|acceptance/i.test(task.title)) empty.needs_review.push(item);
    else empty.queued.push(item);
  }
  return empty;
}

function buildOverview(input: {
  run?: RunRecord;
  workflow?: AgentWorkflowRecord;
  tasks: TaskRecord[];
  events: EventRecord[];
  usage: { inputTokens: number; outputTokens: number; cacheHitTokens: number; cacheMissTokens: number };
  projectPath: string;
}): AgentDashboardOverview {
  const lastEvent = input.events.at(-1);
  const total = input.tasks.length;
  const hit = input.usage.cacheHitTokens;
  const miss = input.usage.cacheMissTokens;
  const createdAtMs = input.workflow?.createdAtMs ?? input.run?.createdAtMs ?? Date.now();
  const staleAge = lastEvent ? Date.now() - lastEvent.createdAtMs : 0;
  const staleIssue = staleAge > 120_000 && (input.run?.status === "running" || input.workflow?.status === "running")
    ? summarizeTechnicalError(`stale no progress for ${formatDuration(staleAge)}. A model call, local tool, long-running service, or permission gate may be waiting.`)
    : undefined;
  return {
    objective: input.workflow?.objective ?? input.run?.message ?? `Project ${input.projectPath}`,
    phase: phaseFromEvent(lastEvent),
    status: input.workflow?.status ?? input.run?.status ?? "unknown",
    elapsedMs: Math.max(0, Date.now() - createdAtMs),
    done: input.tasks.filter((task) => task.status === "succeeded").length,
    running: input.tasks.filter((task) => task.status === "running").length,
    pending: input.tasks.filter((task) => task.status === "queued" || task.status === "paused").length,
    failed: input.tasks.filter((task) => task.status === "failed" || task.status === "cancelled").length,
    total,
    staleReason: staleIssue ? "任务状态一段时间没有更新，可能正在等待模型、工具、权限或长驻服务。" : undefined,
    staleIssue,
    lastTool: latestTool(input.events),
    estimatedCostUsd: undefined,
    cacheHitRate: hit + miss > 0 ? hit / (hit + miss) : undefined,
  };
}

function buildValidation(events: EventRecord[], tasks: TaskRecord[], validationGates: ValidationGateRecord[]): AgentDashboardValidation {
  const failedGates = validationGates.filter((gate) => gate.status === "failed");
  const passedGates = validationGates.filter((gate) => gate.status === "passed");
  const pendingGates = validationGates.filter((gate) => gate.status === "pending");
  const rawFailures = events
    .filter((event) => /failed|error|missing/i.test(event.kind))
    .slice(-8)
    .map((event) => timelineMessage(event) ?? event.kind)
    .filter(Boolean)
    .concat(failedGates.slice(-8).map((gate) => gate.summary).filter(Boolean));
  const failureIssues = rawFailures.map((failure) => summarizeTechnicalError(failure));
  const failures = failureIssues.map((issue) => issueLabel(issue, "zh"));
  const repaired = events
    .filter((event) => /retry|rework|repair|validation|verify/i.test(event.kind))
    .slice(-8)
    .map((event) => timelineMessage(event) ?? event.kind)
    .filter(Boolean)
    .concat(passedGates.slice(-8).map((gate) => gate.summary).filter(Boolean));
  if (failedGates.length) {
    return { status: "failed", summary: failedGates.at(-1)?.summary ?? "A validation gate failed.", failures, failureIssues, repaired };
  }
  if (tasks.some((task) => task.status === "failed")) {
    return { status: "failed", summary: "Some agent tasks failed or need rework.", failures, failureIssues, repaired };
  }
  if (pendingGates.length) {
    return { status: "running", summary: pendingGates.at(-1)?.summary ?? "Validation is waiting for reviewer work.", failures, failureIssues, repaired };
  }
  if (tasks.some((task) => task.status === "running" || task.status === "queued" || task.status === "paused")) {
    return { status: "running", summary: "Validation is still in progress or waiting for later roles.", failures, failureIssues, repaired };
  }
  if (tasks.length && tasks.every((task) => task.status === "succeeded")) {
    return { status: "passed", summary: "All tracked role tasks are marked succeeded.", failures, failureIssues, repaired };
  }
  return { status: "unknown", summary: "No reviewer validation has been recorded yet.", failures, failureIssues, repaired };
}

function normalizeTimelineEvent(event: EventRecord): AgentDashboardTimelineEvent {
  const payload = objectPayload(event.payload);
  const action = objectPayload(payload.action);
  const result = objectPayload(payload.result);
  const role = stringValue(payload.agent) ?? stringValue(payload.role);
  const task = stringValue(payload.title) ?? stringValue(payload.task) ?? stringValue(payload.task_id);
  const rawMessage = timelineMessage(event);
  const issue = issueFromText(rawMessage ?? event.kind);
  return {
    id: String(event.id),
    createdAtMs: event.createdAtMs,
    kind: event.kind,
    role,
    status: stringValue(payload.status) ?? stringValue(result.status),
    task,
    tool: stringValue(action.type) ?? stringValue(payload.tool) ?? stringValue(payload.action_type) ?? stringValue(result.action_type),
    message: issue ? issueLabel(issue, "zh") : rawMessage,
    rawMessage,
    issue,
    artifact: stringValue(result.path) ?? stringValue(payload.path),
    parentRunId: stringValue(payload.parent_run_id) ?? event.runId ?? undefined,
    childRunId: stringValue(payload.child_run_id),
  };
}

function phaseFromEvent(event: EventRecord | undefined): string {
  if (!event) return "initializing";
  if (event.kind.startsWith("tool_")) return "tool execution";
  if (/validation|verify/i.test(event.kind)) return "validation";
  if (/workflow|agent_turn|task/i.test(event.kind)) return "agent orchestration";
  if (/provider|native_tool_plan|cache_prompt/i.test(event.kind)) return "model planning";
  if (/approval|decision|gate/i.test(event.kind)) return "waiting for permission";
  if (/finished|succeeded/.test(event.kind)) return "completed";
  if (/failed|error/.test(event.kind)) return "needs attention";
  return event.kind.replace(/_/g, " ");
}

function timelineMessage(event: EventRecord): string | undefined {
  const payload = objectPayload(event.payload);
  const result = objectPayload(payload.result);
  return stringValue(payload.message)
    ?? stringValue(payload.summary)
    ?? stringValue(payload.detail)
    ?? stringValue(payload.final_message)
    ?? stringValue(result.message)
    ?? stringValue(result.final_message);
}

function blockedIssueFor(role: string, tasks: TaskRecord[], events: EventRecord[]): TechnicalErrorSummary | undefined {
  const failedTask = tasks.find((task) => task.status === "failed");
  if (failedTask) return issueFromTask(failedTask) ?? summarizeTechnicalError(failedTask.title);
  const relevant = events.slice().reverse().find((event) => {
    const payload = objectPayload(event.payload);
    const eventRole = stringValue(payload.agent) ?? stringValue(payload.role);
    return eventRole === role && /failed|gate|decision|rework|retry|blocked/i.test(event.kind);
  });
  return relevant ? summarizeTechnicalError(timelineMessage(relevant) ?? relevant.kind) : undefined;
}

function issueFromTask(task: TaskRecord): TechnicalErrorSummary | undefined {
  const detailIssue = issueFromText(task.detail);
  if (detailIssue) return detailIssue;
  if (task.status === "failed" || task.status === "cancelled") {
    return summarizeTechnicalError(task.detail || task.title);
  }
  return undefined;
}

function issueFromText(value: string | undefined): TechnicalErrorSummary | undefined {
  if (!value || !looksLikeTechnicalIssue(value)) return undefined;
  return summarizeTechnicalError(value);
}

function latestTool(events: EventRecord[]): string | undefined {
  const event = events.slice().reverse().find((candidate) => /^tool(_call)?_(start|started|finish|finished)/.test(candidate.kind));
  if (!event) return undefined;
  const payload = objectPayload(event.payload);
  const action = objectPayload(payload.action);
  const result = objectPayload(payload.result);
  return stringValue(action.type) ?? stringValue(payload.tool) ?? stringValue(result.action_type);
}

function latestToolForRole(role: string, events: EventRecord[]): string | undefined {
  const event = events.slice().reverse().find((candidate) => {
    if (!/^tool(_call)?_(start|started|finish|finished)/.test(candidate.kind)) return false;
    const payload = objectPayload(candidate.payload);
    return stringValue(payload.agent) === role || stringValue(payload.role) === role;
  });
  if (!event) return undefined;
  const payload = objectPayload(event.payload);
  const action = objectPayload(payload.action);
  const result = objectPayload(payload.result);
  return stringValue(action.type) ?? stringValue(payload.tool) ?? stringValue(result.action_type);
}

function readArtifacts(state: StateStore, runId: string): AgentDashboardArtifact[] {
  const traced = state.traceRun(runId) as { artifacts?: unknown[] };
  return (traced.artifacts ?? []).map((item) => {
    const artifact = objectPayload(item);
    return {
      kind: stringValue(artifact.kind) ?? "artifact",
      path: stringValue(artifact.path) ?? "",
      createdAtMs: numberValue(artifact.created_at_ms),
      preview: stringValue(artifact.path) ? path.basename(String(artifact.path)) : undefined,
    };
  }).filter((artifact) => artifact.path);
}

function evidenceForTask(task: TaskRecord): string {
  return task.detail ? `${task.title}: ${compact(task.detail, 120)}` : task.title;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

