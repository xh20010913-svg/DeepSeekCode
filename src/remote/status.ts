import { cacheRate } from "../query/promptCache.js";
import type {
  ApprovalGateRecord,
  EventRecord,
  JobRecord,
  RunRecord,
  StateStore,
  TaskRecord,
  UsageTotals,
} from "../state/sqlite.js";
import { compactOneLine } from "./redact.js";
import type { RemoteRenderState, RemoteTodoItem } from "./renderer.js";

export interface ActiveRemoteRunStatus {
  runId?: string;
  startedAtMs: number;
  lastEventAtMs: number;
  lastEventText?: string;
  renderer?: RemoteRenderState;
}

export interface RemoteStatusInput {
  connection: string;
  projectPath: string;
  model: string;
  shellAllowed: boolean;
  state: StateStore;
  active?: ActiveRemoteRunStatus;
}

interface TraceAction {
  action_type?: string;
  status?: string;
  path?: string;
  message?: string;
  created_at_ms?: number;
}

interface TraceArtifact {
  kind?: string;
  path?: string;
  created_at_ms?: number;
}

interface TraceShape {
  actions?: TraceAction[];
  artifacts?: TraceArtifact[];
}

export function buildRemoteStatus(input: RemoteStatusInput): string {
  const run = input.active?.runId ? input.state.getRun(input.active.runId) : input.state.listRuns(1)[0];
  const usage = run ? input.state.usageTotals(run.id) : input.state.usageTotals();
  const trace = run ? input.state.traceRun(run.id) as TraceShape : undefined;
  const events = run ? input.state.listEvents(run.id, 30) : [];
  const tasks = run ? input.state.listTasks(run.id) : [];
  const jobs = run ? input.state.listJobs({ runId: run.id, limit: 20 }) : [];
  const approvals = run ? input.state.listApprovalGates({ runId: run.id, status: "pending" }, 5) : [];
  const render = input.active?.renderer;
  const latestActivityMs = input.active?.lastEventAtMs
    ?? events[0]?.createdAtMs
    ?? run?.updatedAtMs
    ?? Date.now();
  const activityAgeMs = Date.now() - latestActivityMs;
  const activeState = run ? runStateLabel(run, Boolean(input.active)) : "空闲";
  const todos = render?.todos ?? tasksToTodos(tasks);
  const counts = todoCounts(todos);
  const phase = render?.phase || phaseFromEvents(events) || run?.message || "暂无活动";
  const tool = render?.lastTool || latestTool(events, trace?.actions) || input.active?.lastEventText;
  const issue = firstIssue({
    approvals,
    renderErrors: render?.errors ?? [],
    run,
    stale: Boolean(input.active && activityAgeMs > 90_000),
    activityAgeMs,
  });

  const lines = [
    "📍 DeepSeekCode 远程状态",
    `连接：${compactOneLine(input.connection, 90)}`,
    `项目：${briefPath(input.projectPath)}`,
    `模型：${input.model}  shell：${input.shellAllowed ? "on" : "off"}`,
    run ? `任务：${activeState}  ${shortRunId(run.id)}  耗时：${formatDuration(Date.now() - run.createdAtMs)}` : "任务：空闲",
    run ? `活动：${formatAge(activityAgeMs)}前  actions ${run.actionCount}  产物 ${run.artifactCount}` : "",
    counts.total ? `计划：完成 ${counts.completed}/${counts.total}，进行中 ${counts.inProgress}，待做 ${counts.pending}` : "",
    `阶段：${compactOneLine(phase, 120)}`,
    tool ? `最近：${compactOneLine(tool, 120)}` : "",
    jobsLine(jobs),
    approvals.length ? `等待：${compactOneLine(approvals[0]?.summary ?? "权限确认", 130)}` : "",
    artifactsLine(trace?.artifacts),
    usageLine(usage),
    issue ? `提示：${issue}` : nextActionHint(run, Boolean(input.active), approvals.length),
  ].filter(Boolean);

  const todoLines = todoDetailLines(todos);
  if (todoLines.length) lines.push(...todoLines);
  return lines.join("\n");
}

function runStateLabel(run: RunRecord, active: boolean): string {
  if (run.status === "paused") return "已暂停";
  if (run.status === "failed") return "失败";
  if (run.status === "cancelled") return "已停止";
  if (run.status === "succeeded") return "已完成";
  return active ? "运行中" : "最近运行";
}

function tasksToTodos(tasks: TaskRecord[]): RemoteTodoItem[] {
  return tasks.map((task) => ({
    title: task.title,
    status: task.status === "succeeded"
      ? "completed"
      : task.status === "running"
        ? "in_progress"
        : "pending",
  }));
}

function todoCounts(todos: RemoteTodoItem[]): { total: number; pending: number; inProgress: number; completed: number } {
  return {
    total: todos.length,
    pending: todos.filter((todo) => todo.status === "pending").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    completed: todos.filter((todo) => todo.status === "completed").length,
  };
}

function phaseFromEvents(events: EventRecord[]): string | undefined {
  const event = events.find((candidate) =>
    [
      "native_tool_plan_received",
      "native_tool_plan_failed",
      "provider_call_timing",
      "tool_start",
      "tool_finish",
      "action_report_recorded",
      "run_status_updated",
      "agent_workflow_started",
      "agent_workflow_message",
      "agent_workflow_finished",
      "async_question_answered",
    ].includes(candidate.kind));
  if (!event) return undefined;
  const payload = event.payload as Record<string, unknown>;
  if (event.kind === "provider_call_timing") {
    return `模型调用 ${String(payload.kind ?? "provider")} ${String(payload.status ?? "")}`.trim();
  }
  if (event.kind === "native_tool_plan_received") {
    return `规划工具批次 ${String(payload.attempt ?? "?")}，动作 ${String(payload.action_count ?? "?")} 个`;
  }
  if (event.kind === "native_tool_plan_failed") return "模型工具规划失败，正在重试";
  if (event.kind === "action_report_recorded") return `工具批次完成：${String(payload.status ?? "")}`;
  if (event.kind === "run_status_updated") return `任务状态更新：${String(payload.status ?? "")}`;
  if (event.kind === "agent_workflow_started") return "多 Agent 工作流已启动";
  if (event.kind === "agent_workflow_message") return "多 Agent 正在交换消息";
  if (event.kind === "agent_workflow_finished") return "多 Agent 工作流已结束";
  if (event.kind === "async_question_answered") return "已回答旁路问题";
  return event.kind;
}

function latestTool(events: EventRecord[], actions: TraceAction[] | undefined): string | undefined {
  const toolEvent = events.find((event) => event.kind === "tool_start" || event.kind === "tool_finish");
  if (toolEvent) {
    const payload = toolEvent.payload as Record<string, unknown>;
    const action = payload.action as Record<string, unknown> | undefined;
    const result = payload.result as Record<string, unknown> | undefined;
    const tool = String(result?.action_type ?? action?.type ?? "tool");
    const status = result?.status ? ` ${String(result.status)}` : toolEvent.kind === "tool_start" ? " running" : "";
    const target = String(result?.path ?? action?.path ?? action?.command ?? "");
    const duration = payload.duration_ms ? ` ${formatDuration(Number(payload.duration_ms))}` : "";
    return `${tool}${status}${target ? ` ${target}` : ""}${duration}`.trim();
  }
  const lastAction = actions?.at(-1);
  if (!lastAction) return undefined;
  return `${lastAction.action_type ?? "tool"} ${lastAction.status ?? ""}${lastAction.path ? ` ${lastAction.path}` : ""}`.trim();
}

function jobsLine(jobs: JobRecord[]): string {
  if (!jobs.length) return "";
  const running = jobs.filter((job) => job.status === "running").length;
  const queued = jobs.filter((job) => job.status === "queued").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const current = jobs.find((job) => job.status === "running" || job.status === "queued");
  return `后台：运行 ${running} / 排队 ${queued} / 失败 ${failed}${current ? `，当前 ${current.kind}` : ""}`;
}

function artifactsLine(artifacts: TraceArtifact[] | undefined): string {
  const items = (artifacts ?? []).filter((artifact) => artifact.path);
  if (!items.length) return "";
  const latest = items.slice(-3).map((artifact) => briefPath(String(artifact.path))).join("；");
  return `产物：${items.length} 个，最近 ${latest}`;
}

function usageLine(usage: UsageTotals): string {
  const total = usage.inputTokens + usage.outputTokens;
  if (total === 0 && usage.snapshots === 0) return "用量：暂无";
  return `用量：入 ${usage.inputTokens} / 出 ${usage.outputTokens} / 缓存 ${cacheRate(usage.cacheHitTokens, usage.cacheMissTokens)}`;
}

function firstIssue(input: {
  approvals: ApprovalGateRecord[];
  renderErrors: string[];
  run?: RunRecord;
  stale: boolean;
  activityAgeMs: number;
}): string {
  if (input.approvals.length) return "等待你回复数字审批权限。";
  if (input.renderErrors.length) return compactOneLine(input.renderErrors.at(-1) ?? "", 130);
  if (input.run?.status === "paused") return compactOneLine(input.run.message || "任务暂停，需要 /continue 或继续给指令。", 140);
  if (input.run?.status === "failed") return compactOneLine(input.run.message || "任务失败，发送 /status 查看最近工具和问题。", 140);
  if (input.stale) return `超过 ${formatDuration(input.activityAgeMs)} 没有新事件，可能在等待模型 API、外部工具或网络。`;
  return "";
}

function nextActionHint(run: RunRecord | undefined, active: boolean, pendingApprovalCount: number): string {
  if (pendingApprovalCount) return "回复 1/2/3/4 处理权限。";
  if (active) return "发送 /status 刷新；发送 /ask <问题> 旁路问答；发送 /stop 停止。";
  if (run?.status === "paused") return "发送 /continue 继续暂停任务，或发送新任务。";
  return "可以发送新任务，或 /artifacts 查看最近产物。";
}

function todoDetailLines(todos: RemoteTodoItem[]): string[] {
  const inProgress = todos.filter((todo) => todo.status === "in_progress").slice(0, 2);
  const pending = todos.filter((todo) => todo.status === "pending").slice(0, 3);
  const lines: string[] = [];
  if (inProgress.length) lines.push(`正在：${inProgress.map((todo) => compactOneLine(todo.title, 42)).join("；")}`);
  if (pending.length) lines.push(`待做：${pending.map((todo) => compactOneLine(todo.title, 36)).join("；")}`);
  return lines;
}

function shortRunId(runId: string): string {
  return runId.replace(/^run_/, "").slice(0, 8);
}

function formatAge(ms: number): string {
  if (ms < 5_000) return "刚刚";
  return formatDuration(ms);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function briefPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return value;
  return `${parts.at(-2)}\\${parts.at(-1)}`;
}
