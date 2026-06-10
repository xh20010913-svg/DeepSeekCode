import path from "node:path";
import type { EventRecord, ProjectProcessRecord, RunRecord, StateStore, TaskRecord, TaskStatus, UsageTotals, ValidationGateRecord } from "../../state/sqlite.js";
import { issueLabel, looksLikeTechnicalIssue, summarizeTechnicalError, type TechnicalErrorSummary } from "../../utils/technicalErrorSummary.js";
import {
  AgentWorkflowService,
  type AgentRoleSpec,
  type AgentRoleState,
  type AgentWorkflowMessage,
  type AgentWorkflowRecord,
  type GeneratedRoleSkill,
  type WorkflowSubtaskState,
} from "./agentWorkflow.js";

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
  contextScope?: string;
  status: TaskStatus | "defined";
  currentTask?: string;
  assignedTasks: string[];
  completedTasks: string[];
  blockedBy?: string;
  blockedIssue?: TechnicalErrorSummary;
  lastTool?: string;
  lastMessage?: string;
  checkpoint?: string;
  transcript: string[];
  toolResultSummary: string[];
  skills: string[];
  tools: string[];
  acceptance: string[];
  requiredOutputs: string[];
  riskChecks: string[];
  handoffFormat?: string;
  generatedSkillId?: string;
  generatedSkillSummary?: string;
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

export interface AgentDashboardCompletionSummary {
  total: number;
  queued: number;
  running: number;
  needsReview: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  percent: number;
}

export interface AgentDashboardMobileSummary {
  objective: string;
  phase: string;
  approvalStatus: string;
  overallProgress: string;
  activeRoles: string[];
  unfinishedTasks: Array<{ id: string; title: string; role: string; status: string }>;
  blockedTasks: Array<{ id: string; title: string; role: string; blockedBy?: string }>;
  latestArtifacts: string[];
  nextStep: string;
  recentEvents: string[];
}

export interface AgentDashboardConnectionState {
  status: "online" | "offline";
  serverHeartbeat: number;
  offlineReason?: string;
}

export interface AgentDashboardReadyQueueItem {
  id: string;
  title: string;
  role: string;
  priority: number;
  dependencies: string[];
  evidenceRequirements: string[];
}

export interface AgentDashboardEvidence {
  evidenceId?: string;
  kind: string;
  summary: string;
  role?: string;
  subtaskId?: string;
  path?: string;
  url?: string;
  createdAtMs: number;
}

export interface AgentDashboardSpan {
  spanId: string;
  parentSpanId?: string;
  stage: string;
  status: string;
  role?: string;
  subtaskId?: string;
  toolCallId?: string;
  budgetPlanId?: string;
  evidenceId?: string;
  summary: string;
  startedAtMs?: number;
  finishedAtMs?: number;
}

export interface AgentDashboardLayoutModel {
  version: string;
  desktop: "split-ops-room";
  mobile: "summary-drawer";
  zones: Array<{ id: string; label: string; purpose: string }>;
  roleLocations: Record<string, "workbench" | "dispatch" | "lounge" | "review" | "blocked">;
}

export interface AgentDashboardCacheSummary {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheHitRate: number | null;
  approxPromptTokens?: number;
  dynamicChars?: number;
  maxDynamicChars?: number;
  dynamicShare?: number;
  stableHash?: string;
  dynamicHash?: string;
  droppedChars?: number;
  droppedBlocks?: unknown[];
  lowHitReason?: string;
}

export interface AgentDashboardSnapshot {
  run?: RunRecord;
  workflow?: AgentWorkflowRecord;
  generatedAtMs: number;
  projectPath: string;
  overview: AgentDashboardOverview;
  roles: AgentDashboardRole[];
  taskBoard: Record<"queued" | "running" | "needs_review" | "succeeded" | "failed", AgentDashboardTask[]>;
  phase?: string;
  approvalState?: AgentWorkflowRecord["approvalState"];
  rolePlan?: AgentWorkflowRecord["rolePlan"];
  subtaskGraph: WorkflowSubtaskState[];
  generatedSkills: GeneratedRoleSkill[];
  readyQueue: AgentDashboardReadyQueueItem[];
  evidence: AgentDashboardEvidence[];
  evidenceBySubtask: Record<string, AgentDashboardEvidence[]>;
  spans: AgentDashboardSpan[];
  layoutModel: AgentDashboardLayoutModel;
  completionSummary: AgentDashboardCompletionSummary;
  mobileSummary: AgentDashboardMobileSummary;
  agentDiagnostics: Record<string, unknown>;
  timeline: AgentDashboardTimelineEvent[];
  artifacts: AgentDashboardArtifact[];
  validation: AgentDashboardValidation;
  connectionState: AgentDashboardConnectionState;
  serverHeartbeat: number;
  processes: ProjectProcessRecord[];
  cacheSummary: AgentDashboardCacheSummary;
  tokenBudget?: Record<string, unknown>;
  budgetTrend: Array<Record<string, unknown>>;
  browserOpenState?: Record<string, unknown>;
  offlineReason?: string;
}

export function buildAgentDashboardSnapshot(input: {
  state: StateStore;
  projectPath: string;
  runId?: string;
}): AgentDashboardSnapshot {
  const activeStatus = activeWorkflowStatus(input.state, input.projectPath);
  const requestedRunId = input.runId;
  const workflowStatus = workflowStatusForRun(input.state, input.projectPath, activeStatus, requestedRunId);
  const runId = workflowStatus?.record.runId ?? requestedRunId ?? latestRunForProject(input.state, input.projectPath)?.id;
  const run = runId ? input.state.getRun(runId) : undefined;
  const associatedRunIds = associatedRunIdsForSnapshot(input.state, input.projectPath, workflowStatus?.record, requestedRunId ?? runId);
  const tasks = workflowStatus?.record.runId
    ? input.state.listTasks(workflowStatus.record.runId)
    : runId ? input.state.listTasks(runId) : [];
  const events = mergeEvents(associatedRunIds.map((id) => input.state.listEvents(id, 160)));
  const validationGates = runId ? input.state.listValidationGates({ runId }, 20).reverse() : [];
  const usage = runId ? input.state.usageTotals(runId) : input.state.usageTotals();
  const artifacts = associatedRunIds.flatMap((id) => readArtifacts(input.state, id));
  const messages = workflowStatus?.messages ?? [];
  const processRecords = input.state.listProjectProcesses({ projectPath: input.projectPath, includeStale: true, limit: 20 });
  const evidence = buildEvidence(events);
  const spans = buildSpans(events);
  const latestBudgetEvents = events.filter((event) => event.kind === "agent_kernel_budget_plan" || event.kind === "cache_prompt_plan").slice(-5);
  const roles = buildRoles({
    roles: workflowStatus?.record.roles ?? inferRoles(tasks),
    tasks,
    events,
    messages,
    generatedSkills: workflowStatus?.record.generatedSkills ?? [],
  });
  const overview = buildOverview({
    run,
    workflow: workflowStatus?.record,
    tasks,
    events,
    usage,
    projectPath: input.projectPath,
  });
  const eventTimeline = events.slice(-120).map((event) => normalizeTimelineEvent(event));
  const messageTimeline = workflowStatus
    ? workflowStatus.messages.slice(-80).map((message, index) => workflowMessageToTimelineEvent(message, index, workflowStatus.record))
    : [];
  const timeline = [...eventTimeline, ...messageTimeline]
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .slice(-180);
  const latestCachePromptEvent = [...events].reverse().find((event) => event.kind === "cache_prompt_plan");
  const serverHeartbeat = Date.now();

  return {
    run,
    workflow: workflowStatus?.record,
    generatedAtMs: Date.now(),
    projectPath: input.projectPath,
    overview,
    roles,
    taskBoard: buildTaskBoard(tasks),
    phase: workflowStatus?.record.phase,
    approvalState: workflowStatus?.record.approvalState,
    rolePlan: workflowStatus?.record.rolePlan,
    subtaskGraph: workflowStatus?.record.subtaskGraph ?? [],
    generatedSkills: workflowStatus?.record.generatedSkills ?? [],
    readyQueue: buildReadyQueue(workflowStatus?.record),
    evidence,
    evidenceBySubtask: groupEvidenceBySubtask(evidence),
    spans,
    layoutModel: buildLayoutModel(roles),
    completionSummary: buildCompletionSummary(workflowStatus?.record.subtaskGraph ?? []),
    mobileSummary: buildMobileSummary({
      workflow: workflowStatus?.record,
      roles,
      timeline,
      artifacts,
    }),
    agentDiagnostics: buildAgentDiagnostics(workflowStatus?.record, roles),
    timeline,
    artifacts,
    validation: buildValidation(events, tasks, validationGates),
    connectionState: {
      status: "online",
      serverHeartbeat,
    },
    serverHeartbeat,
    processes: processRecords,
    cacheSummary: buildCacheSummary(usage, latestCachePromptEvent),
    tokenBudget: tokenBudgetFromEvent(latestCachePromptEvent),
    budgetTrend: latestBudgetEvents.map(budgetTrendFromEvent),
    browserOpenState: browserOpenState(input.state, input.projectPath, workflowStatus?.record?.runId ?? runId),
  };
}

export function serializeAgentTraceJsonl(snapshot: AgentDashboardSnapshot): string {
  const meta = {
    source: "deepseekcode",
    schema: "pixel-agents-compatible.v1",
    kind: "run_snapshot",
    runId: snapshot.run?.id,
    workflowId: snapshot.workflow?.id,
    projectPath: snapshot.projectPath,
    createdAtMs: snapshot.generatedAtMs,
    status: snapshot.overview.status,
    task: snapshot.overview.objective,
  };
  const events = snapshot.timeline.map((event) => ({
    source: "deepseekcode",
    schema: "pixel-agents-compatible.v1",
    runId: snapshot.run?.id,
    workflowId: snapshot.workflow?.id,
    role: event.role,
    status: event.status,
    task: event.task,
    tool: event.tool,
    message: event.message,
    rawMessage: event.rawMessage,
    issue: event.issue ? {
      category: event.issue.category,
      severity: event.issue.severity,
      title: event.issue.title,
      explanation: event.issue.explanation,
      suggestion: event.issue.suggestion,
      firstLine: event.issue.firstLine,
    } : undefined,
    artifact: event.artifact,
    parentRunId: event.parentRunId ?? snapshot.run?.id,
    childRunId: event.childRunId,
    kind: event.kind,
    createdAtMs: event.createdAtMs,
  }));
  return [meta, ...events].map((line) => JSON.stringify(line)).join("\n");
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

function workflowStatusForRun(
  state: StateStore,
  projectPath: string,
  activeStatus: ReturnType<typeof activeWorkflowStatus>,
  runId?: string,
): ReturnType<typeof activeWorkflowStatus> {
  if (!activeStatus) return undefined;
  if (!runId || runId === activeStatus.record.runId) return activeStatus;
  if (runLinksToWorkflow(state, runId, activeStatus.record)) return activeStatus;
  const requestedRun = state.getRun(runId);
  if (requestedRun && normalizePath(requestedRun.projectPath) === normalizePath(projectPath)) {
    const latest = latestRunForProject(state, projectPath);
    if (latest?.id === runId && activeStatus.record.status !== "succeeded") return activeStatus;
  }
  return undefined;
}

function runLinksToWorkflow(state: StateStore, runId: string, workflow: AgentWorkflowRecord): boolean {
  return state.listEvents(runId, 80).some((event) => {
    const payload = objectPayload(event.payload);
    return stringValue(payload.workflow_id) === workflow.id
      || stringValue(payload.workflow_run_id) === workflow.runId
      || stringValue(payload.parent_run_id) === workflow.runId;
  });
}

function associatedRunIdsForSnapshot(
  state: StateStore,
  projectPath: string,
  workflow: AgentWorkflowRecord | undefined,
  selectedRunId?: string,
): string[] {
  const ids = new Set<string>();
  if (workflow?.runId) ids.add(workflow.runId);
  if (selectedRunId) ids.add(selectedRunId);
  if (workflow) {
    const normalized = normalizePath(projectPath);
    for (const run of state.listRuns(50)) {
      if (normalizePath(run.projectPath) !== normalized) continue;
      if (run.id === workflow.runId) continue;
      if (runLinksToWorkflow(state, run.id, workflow)) ids.add(run.id);
    }
  }
  return [...ids];
}

function mergeEvents(eventGroups: EventRecord[][]): EventRecord[] {
  const byId = new Map<number, EventRecord>();
  for (const event of eventGroups.flat()) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id).slice(-220);
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
  roles: Array<AgentRoleSpec | AgentRoleState>;
  tasks: TaskRecord[];
  events: EventRecord[];
  messages: AgentWorkflowMessage[];
  generatedSkills: GeneratedRoleSkill[];
}): AgentDashboardRole[] {
  return input.roles.map((role) => {
    const name = roleName(role);
    const skill = input.generatedSkills.find((candidate) => candidate.id === (role as AgentRoleState).generatedSkillId || candidate.role === name);
    const tasks = input.tasks.filter((task) => task.agent === name);
    const running = tasks.find((task) => task.status === "running");
    const blockedIssue = blockedIssueFor(name, tasks, input.events);
    const latestMessage = input.messages
      .filter((message) => message.from === name || message.to === name || message.to === "all")
      .at(-1);
    const roleState = isRoleState(role) ? role : undefined;
    return {
      role: name,
      responsibility: role.responsibility,
      contextScope: roleState?.contextScope,
      status: roleStatus(tasks, roleState?.status),
      currentTask: running?.title,
      assignedTasks: roleState?.assignedTasks.length ? roleState.assignedTasks : tasks.map((task) => task.title),
      completedTasks: unique([
        ...(roleState?.completedTasks ?? []),
        ...tasks.filter((task) => task.status === "succeeded").map((task) => evidenceForTask(task)),
      ]),
      blockedBy: roleState?.blockedBy ? compact(roleState.blockedBy, 220) : blockedIssue ? issueLabel(blockedIssue, "zh") : undefined,
      blockedIssue,
      lastTool: latestToolForRole(name, input.events) ?? roleState?.toolResultSummary.at(-1)?.split(":")[0],
      lastMessage: roleState?.lastMessage
        ? compact(roleState.lastMessage, 220)
        : latestMessage ? `${latestMessage.from} -> ${latestMessage.to}: ${compact(latestMessage.message, 180)}` : undefined,
      checkpoint: roleState?.checkpoint ? compact(roleState.checkpoint, 900) : undefined,
      transcript: (roleState?.transcript ?? []).slice(-8).map((entry) => `${entry.role}/${entry.kind}: ${compact(entry.text, 220)}`),
      toolResultSummary: (roleState?.toolResultSummary ?? []).slice(-8),
      skills: roleSkills(role),
      tools: roleTools(role),
      acceptance: roleAcceptance(role),
      requiredOutputs: roleState?.requiredOutputs ?? [],
      riskChecks: roleState?.riskChecks ?? [],
      handoffFormat: roleState?.handoffFormat,
      generatedSkillId: roleState?.generatedSkillId,
      generatedSkillSummary: skill?.summary,
    };
  });
}

function roleStatus(tasks: TaskRecord[], explicit?: AgentRoleState["status"]): AgentDashboardRole["status"] {
  if (explicit === "running") return "running";
  if (explicit === "blocked") return "paused";
  if (explicit === "failed") return "failed";
  if (explicit === "succeeded" && tasks.length === 0) return "succeeded";
  if (explicit === "idle" && tasks.length === 0) return "defined";
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
  usage: UsageTotals;
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

function buildCacheSummary(usage: UsageTotals, latestCachePromptEvent?: EventRecord): AgentDashboardCacheSummary {
  const totalCacheTokens = usage.cacheHitTokens + usage.cacheMissTokens;
  const payload = latestCachePromptEvent ? objectPayload(latestCachePromptEvent.payload) : {};
  const droppedChars = numberValue(payload.dropped_chars);
  const approxPromptTokens = numberValue(payload.approx_tokens);
  const dynamicShare = numberValue(payload.dynamic_share);
  const cacheHitRate = totalCacheTokens > 0 ? usage.cacheHitTokens / totalCacheTokens : null;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheHitTokens: usage.cacheHitTokens,
    cacheMissTokens: usage.cacheMissTokens,
    cacheHitRate,
    approxPromptTokens,
    dynamicChars: numberValue(payload.dynamic_chars),
    maxDynamicChars: numberValue(payload.max_dynamic_chars),
    dynamicShare,
    stableHash: stringValue(payload.stable_hash),
    dynamicHash: stringValue(payload.dynamic_hash),
    droppedChars,
    droppedBlocks: Array.isArray(payload.dropped_blocks) ? payload.dropped_blocks : undefined,
    lowHitReason: cacheHitRate !== null && cacheHitRate < 0.35
      ? "稳定前缀命中偏低：可能是动态上下文、memory 或 skill 摘要过大。"
      : dynamicShare !== undefined && dynamicShare > 0.85
        ? "动态 prompt 占比过高，容易破坏 DeepSeek prefix cache 复用。"
        : droppedChars && droppedChars > 0
        ? "动态 prompt 超预算，部分上下文已裁剪。"
        : undefined,
  };
}

function tokenBudgetFromEvent(event?: EventRecord): Record<string, unknown> | undefined {
  if (!event) return undefined;
  const payload = objectPayload(event.payload);
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : undefined;
  return {
    attempt: numberValue(payload.attempt),
    effort: stringValue(payload.effort),
    approxTokens: numberValue(payload.approx_tokens),
    dynamicChars: numberValue(payload.dynamic_chars),
    maxDynamicChars: numberValue(payload.max_dynamic_chars),
    dynamicShare: numberValue(payload.dynamic_share),
    stableHash: stringValue(payload.stable_hash),
    dynamicHash: stringValue(payload.dynamic_hash),
    droppedChars: numberValue(payload.dropped_chars),
    droppedBlocks: Array.isArray(payload.dropped_blocks) ? payload.dropped_blocks : undefined,
    blockCount: blocks?.length,
  };
}

function budgetTrendFromEvent(event: EventRecord): Record<string, unknown> {
  const payload = objectPayload(event.payload);
  return {
    id: event.id,
    kind: event.kind,
    createdAtMs: event.createdAtMs,
    budgetPlanId: stringValue(payload.budgetPlanId) ?? stringValue(payload.budget_plan_id),
    stableHash: stringValue(payload.stable_hash),
    dynamicHash: stringValue(payload.dynamic_hash),
    dynamicChars: numberValue(payload.dynamic_chars),
    maxDynamicChars: numberValue(payload.max_dynamic_chars),
    dynamicShare: numberValue(payload.dynamic_share),
    droppedChars: numberValue(payload.dropped_chars),
    shouldCompact: booleanValue(payload.should_compact),
  };
}

function browserOpenState(state: StateStore, projectPath: string, runId?: string): Record<string, unknown> | undefined {
  if (!runId) return undefined;
  const scope = `agent_dashboard:${path.resolve(projectPath)}`;
  const value = state.getUiState<Record<string, unknown>>(scope, `auto_opened:${runId}`);
  return value ? { ...value, runId } : { runId, opened: false };
}

function buildReadyQueue(workflow?: AgentWorkflowRecord): AgentDashboardReadyQueueItem[] {
  if (!workflow) return [];
  const done = new Set(workflow.subtaskGraph
    .filter((subtask) => subtask.status === "succeeded" || subtask.status === "skipped")
    .map((subtask) => subtask.id));
  return workflow.subtaskGraph
    .filter((subtask) => subtask.status === "queued")
    .filter((subtask) => subtask.dependencies.every((dependency) => done.has(dependency)))
    .map((subtask, index) => ({
      id: subtask.id,
      title: subtask.title,
      role: subtask.assigneeRole,
      priority: index + 1,
      dependencies: subtask.dependencies,
      evidenceRequirements: [
        ...subtask.acceptanceCriteria,
        ...subtask.expectedOutputs.map((output) => `产物: ${output}`),
      ],
    }));
}

function buildEvidence(events: EventRecord[]): AgentDashboardEvidence[] {
  return events
    .filter((event) => event.kind === "agent_kernel_evidence" || event.kind === "tool_end")
    .slice(-40)
    .map((event) => {
      const payload = objectPayload(event.payload);
      const result = objectPayload(payload.result);
      return {
        evidenceId: stringValue(payload.evidenceId),
        kind: stringValue(payload.kind) ?? stringValue(result.artifact_kind) ?? stringValue(result.action_type) ?? event.kind,
        summary: compact(stringValue(payload.summary) ?? stringValue(result.message) ?? event.kind, 260),
        role: stringValue(payload.role),
        subtaskId: stringValue(payload.subtaskId) ?? stringValue(payload.subtask_id),
        path: stringValue(payload.path) ?? stringValue(result.path),
        url: stringValue(payload.url),
        createdAtMs: event.createdAtMs,
      };
    });
}

function groupEvidenceBySubtask(evidence: AgentDashboardEvidence[]): Record<string, AgentDashboardEvidence[]> {
  const grouped: Record<string, AgentDashboardEvidence[]> = {};
  for (const item of evidence) {
    if (!item.subtaskId) continue;
    grouped[item.subtaskId] = [...(grouped[item.subtaskId] ?? []), item];
  }
  return grouped;
}

function buildSpans(events: EventRecord[]): AgentDashboardSpan[] {
  return events
    .filter((event) => event.kind === "agent_kernel_span")
    .slice(-80)
    .map((event) => {
      const payload = objectPayload(event.payload);
      return {
        spanId: stringValue(payload.spanId) ?? `span_${event.id}`,
        parentSpanId: stringValue(payload.parentSpanId),
        stage: stringValue(payload.stage) ?? "unknown",
        status: stringValue(payload.status) ?? "unknown",
        role: stringValue(payload.role),
        subtaskId: stringValue(payload.subtaskId),
        toolCallId: stringValue(payload.toolCallId),
        budgetPlanId: stringValue(payload.budgetPlanId),
        evidenceId: stringValue(payload.evidenceId),
        summary: compact(stringValue(payload.summary) ?? event.kind, 260),
        startedAtMs: numberValue(payload.startedAtMs) ?? event.createdAtMs,
        finishedAtMs: numberValue(payload.finishedAtMs),
      };
    });
}

function buildLayoutModel(roles: AgentDashboardRole[]): AgentDashboardLayoutModel {
  const roleLocations: AgentDashboardLayoutModel["roleLocations"] = {};
  for (const role of roles) {
    roleLocations[role.role] = role.blockedBy
      ? "blocked"
      : role.status === "running"
        ? "workbench"
        : /验收|验证|测试|质检|review|acceptance|verify|test|qa/i.test(`${role.role} ${role.responsibility}`)
          ? "review"
          : role.status === "queued" || role.status === "paused"
            ? "dispatch"
            : "lounge";
  }
  return {
    version: "ops-room.v2",
    desktop: "split-ops-room",
    mobile: "summary-drawer",
    zones: [
      { id: "blackboard", label: "会议室任务黑板", purpose: "展示全部任务、负责人、依赖、优先级和未接任务" },
      { id: "workbench", label: "工位区", purpose: "运行中的角色在这里执行工具和交付产物" },
      { id: "dispatch", label: "派发区", purpose: "排队、可执行和等待确认的任务在这里流转" },
      { id: "lounge", label: "休息区", purpose: "空闲、完成或等待下一轮的角色回到这里" },
      { id: "evidence", label: "产物角", purpose: "汇总路径、URL、截图、日志和验收 evidence" },
    ],
    roleLocations,
  };
}

function buildCompletionSummary(subtasks: WorkflowSubtaskState[]): AgentDashboardCompletionSummary {
  const counts = {
    total: subtasks.length,
    queued: subtasks.filter((subtask) => subtask.status === "queued").length,
    running: subtasks.filter((subtask) => subtask.status === "running").length,
    needsReview: subtasks.filter((subtask) => subtask.status === "needs_review").length,
    succeeded: subtasks.filter((subtask) => subtask.status === "succeeded").length,
    failed: subtasks.filter((subtask) => subtask.status === "failed").length,
    blocked: subtasks.filter((subtask) => subtask.status === "blocked").length,
    skipped: subtasks.filter((subtask) => subtask.status === "skipped").length,
  };
  return {
    ...counts,
    percent: counts.total > 0 ? Math.round(((counts.succeeded + counts.skipped) / counts.total) * 100) : 0,
  };
}

function buildMobileSummary(input: {
  workflow?: AgentWorkflowRecord;
  roles: AgentDashboardRole[];
  timeline: AgentDashboardTimelineEvent[];
  artifacts: AgentDashboardArtifact[];
}): AgentDashboardMobileSummary {
  const workflow = input.workflow;
  const subtasks = workflow?.subtaskGraph ?? [];
  const completion = buildCompletionSummary(subtasks);
  const activeRoles = input.roles
    .filter((role) => role.status === "running" || role.blockedBy)
    .map((role) => `${role.role}${role.currentTask ? `: ${role.currentTask}` : ""}`)
    .slice(0, 6);
  const unfinishedTasks = subtasks
    .filter((subtask) => !["succeeded", "skipped"].includes(subtask.status))
    .slice(0, 8)
    .map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      role: subtask.assigneeRole,
      status: subtask.status,
    }));
  const blockedTasks = subtasks
    .filter((subtask) => subtask.status === "blocked" || subtask.status === "failed")
    .slice(0, 6)
    .map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      role: subtask.assigneeRole,
      blockedBy: subtask.blockedBy,
    }));
  const nextStep = workflow?.phase === "awaiting_approval"
    ? "等待确认计划：发送“执行”、 “修改：...”、 “重生成”或“取消”。"
    : blockedTasks.length
      ? "优先修复阻塞任务，然后继续原 workflow。"
      : completion.needsReview
        ? "等待 AcceptanceReviewer 验收待审任务。"
        : completion.running
          ? "角色正在执行当前子任务。"
          : completion.queued
            ? "继续执行下一个可运行子任务。"
            : completion.succeeded
              ? "汇总最终验收结果。"
              : "等待新的任务进展。";
  return {
    objective: workflow?.objective ?? "",
    phase: workflow?.phase ?? "unknown",
    approvalStatus: workflow?.approvalState.status ?? "unknown",
    overallProgress: `${completion.succeeded + completion.skipped}/${completion.total} (${completion.percent}%)`,
    activeRoles,
    unfinishedTasks,
    blockedTasks,
    latestArtifacts: input.artifacts.slice(-5).map((artifact) => artifact.path),
    nextStep,
    recentEvents: input.timeline.slice(-5).map((event) => event.message ?? event.kind).filter(Boolean),
  };
}

function buildAgentDiagnostics(
  workflow: AgentWorkflowRecord | undefined,
  roles: AgentDashboardRole[],
): Record<string, unknown> {
  if (!workflow) return {};
  const skillByRole = new Map(workflow.generatedSkills.map((skill) => [skill.role, skill]));
  return {
    workflow: {
      id: workflow.id,
      phase: workflow.phase,
      approvalState: workflow.approvalState,
      plannerNotes: workflow.rolePlan.plannerNotes,
      expectedArtifacts: workflow.expectedArtifacts,
      verificationPlan: workflow.verificationPlan,
      riskAndPermissionNotes: workflow.riskAndPermissionNotes,
    },
    roles: roles.map((role) => ({
      ...role,
      generatedSkill: skillByRole.get(role.role),
      subtasks: workflow.subtaskGraph.filter((subtask) => subtask.assigneeRole === role.role || (role.role === "AcceptanceReviewer" && subtask.status === "needs_review")),
    })),
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

function workflowMessageToTimelineEvent(
  message: AgentWorkflowMessage,
  index: number,
  workflow: AgentWorkflowRecord,
): AgentDashboardTimelineEvent {
  return {
    id: `agent-message-${workflow.id}-${message.createdAtMs}-${index}`,
    createdAtMs: message.createdAtMs,
    kind: "agent_message",
    role: message.from,
    status: "message",
    task: message.to === "all" ? undefined : `to ${message.to}`,
    message: `${message.from} -> ${message.to}: ${compact(message.message, 500)}`,
    rawMessage: message.message,
    parentRunId: workflow.runId,
    childRunId: workflow.id,
  };
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

function isRoleState(role: AgentRoleSpec | AgentRoleState): role is AgentRoleState {
  return "transcript" in role || "allowedTools" in role || "preloadedSkills" in role;
}

function roleName(role: AgentRoleSpec | AgentRoleState): string {
  const candidate = (role as AgentRoleState).role ?? role.name;
  return candidate || "agent";
}

function roleSkills(role: AgentRoleSpec | AgentRoleState): string[] {
  const state = role as AgentRoleState;
  return unique([...(state.preloadedSkills ?? []), ...((role as AgentRoleSpec).skills ?? [])]);
}

function roleTools(role: AgentRoleSpec | AgentRoleState): string[] {
  const state = role as AgentRoleState;
  return unique([...(state.allowedTools ?? []), ...((role as AgentRoleSpec).tools ?? [])]);
}

function roleAcceptance(role: AgentRoleSpec | AgentRoleState): string[] {
  return unique([...(role.acceptance ?? []), ...((role as AgentRoleSpec).acceptanceCriteria ?? [])]);
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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
