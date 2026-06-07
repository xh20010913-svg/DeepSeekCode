import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ActionExecutionReport, ActionRequest, TaskCompletionContractSchema } from "../../protocol/actions.js";
import type { StateStore, TaskRecord } from "../../state/sqlite.js";
import type { z } from "zod";

export type WorkflowRoleStatus = "queued" | "running" | "blocked" | "succeeded" | "failed" | "idle";
export type WorkflowPhase = "planning" | "awaiting_approval" | "executing" | "reviewing" | "completed" | "blocked" | "cancelled";
export type WorkflowSubtaskStatus = "queued" | "running" | "needs_review" | "succeeded" | "failed" | "blocked" | "skipped";

export type TaskCompletionContract = z.input<typeof TaskCompletionContractSchema>;

export interface AgentRoleSpec {
  name?: string;
  role?: string;
  responsibility: string;
  contextScope?: string;
  allowedTools?: string[];
  preloadedSkills?: string[];
  assignedTasks?: string[];
  skills?: string[];
  tools?: string[];
  acceptance?: string[];
  acceptanceCriteria?: string[];
  requiredOutputs?: string[];
  riskChecks?: string[];
  handoffFormat?: string;
  checkpoint?: string;
}

export interface AgentWorkflowTranscriptEntry {
  role: string;
  kind: "system" | "message" | "tool" | "summary" | "checkpoint";
  text: string;
  createdAtMs: number;
}

export interface AgentRoleState {
  name: string;
  role: string;
  responsibility: string;
  contextScope: string;
  allowedTools: string[];
  preloadedSkills: string[];
  assignedTasks: string[];
  completedTasks: string[];
  transcript: AgentWorkflowTranscriptEntry[];
  toolResultSummary: string[];
  checkpoint: string;
  status: WorkflowRoleStatus;
  lastMessage?: string;
  blockedBy?: string;
  taskIds: string[];
  skills: string[];
  tools: string[];
  acceptance: string[];
  requiredOutputs: string[];
  riskChecks: string[];
  handoffFormat: string;
  generatedSkillId?: string;
}

export interface GeneratedRoleSkill {
  id: string;
  role: string;
  title: string;
  summary: string;
  prompt: string;
  allowedTools: string[];
  outputFormat: string;
  riskChecks: string[];
  handoffFormat: string;
  createdAtMs: number;
}

export interface WorkflowSubtaskState {
  id: string;
  title: string;
  description: string;
  assigneeRole: string;
  parentId?: string;
  dependencies: string[];
  status: WorkflowSubtaskStatus;
  acceptanceCriteria: string[];
  expectedOutputs: string[];
  evidence: string[];
  blockedBy?: string;
  repairHint?: string;
  createdBy: string;
  taskId?: string;
  updatedAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  lastEvent?: string;
}

export interface WorkflowRolePlan {
  source: "model" | "heuristic" | "user";
  plannerNotes: string;
  roles: AgentRoleState[];
}

export interface WorkflowApprovalState {
  required: boolean;
  status: "not_required" | "pending" | "approved" | "revision_requested" | "regenerating" | "cancelled";
  requestedAtMs?: number;
  decidedAtMs?: number;
  note?: string;
  revisionCount: number;
}

export interface AgentWorkflowRecord {
  id: string;
  runId: string;
  objective: string;
  phase: WorkflowPhase;
  approvalState: WorkflowApprovalState;
  rolePlan: WorkflowRolePlan;
  roles: AgentRoleState[];
  subtaskGraph: WorkflowSubtaskState[];
  generatedSkills: GeneratedRoleSkill[];
  expectedArtifacts: string[];
  verificationPlan: string[];
  riskAndPermissionNotes: string[];
  contract?: NormalizedTaskCompletionContract;
  acceptanceCriteria: string[];
  maxSteps: number;
  status: "running" | "succeeded" | "failed" | "needs_followup" | "cancelled";
  createdAtMs: number;
  updatedAtMs: number;
}

export interface NormalizedTaskCompletionContract {
  objective: string;
  expectedOutputs: Array<{
    kind: string;
    description: string;
    required: boolean;
  }>;
  acceptanceCriteria: string[];
  userConstraints: string[];
  verificationHints: string[];
}

export interface AgentWorkflowMessage {
  from: string;
  to: string;
  message: string;
  createdAtMs: number;
}

export class AgentWorkflowService {
  private readonly scope: string;

  constructor(
    private readonly state: StateStore,
    private readonly projectPath: string,
  ) {
    this.scope = `agent_workflows:${path.resolve(projectPath)}`;
  }

  start(input: {
    runId: string;
    objective: string;
    roles?: AgentRoleSpec[];
    contract?: TaskCompletionContract;
    acceptanceCriteria?: string[];
    maxSteps?: number;
    autoApprove?: boolean;
    rolePlan?: WorkflowRolePlan;
    subtaskGraph?: WorkflowSubtaskState[];
    generatedSkills?: GeneratedRoleSkill[];
    expectedArtifacts?: string[];
    verificationPlan?: string[];
    riskAndPermissionNotes?: string[];
  }): AgentWorkflowRecord {
    const now = Date.now();
    const id = `workflow_${randomUUID()}`;
    const contract = normalizeTaskCompletionContract(input.contract, input.objective, input.acceptanceCriteria ?? []);
    const rolePlan = input.rolePlan ?? buildCleanWorkflowPlan(input.roles, input.objective, contract);
    let roles = ensurePlannerAndAcceptanceReviewer(rolePlan.roles, input.objective, contract);
    let generatedSkills = normalizeGeneratedSkills(input.generatedSkills, roles, contract);
    roles = attachGeneratedSkillsToRoles(roles, generatedSkills);
    let subtaskGraph = normalizeSubtaskGraph(
      input.subtaskGraph?.length ? input.subtaskGraph : buildCleanSubtasks(input.objective, contract, roles),
      roles,
      contract,
      now,
    );
    const autoApproved = Boolean(input.autoApprove);
    const record: AgentWorkflowRecord = {
      id,
      runId: input.runId,
      objective: input.objective,
      phase: autoApproved ? "executing" : "awaiting_approval",
      approvalState: {
        required: !autoApproved,
        status: autoApproved ? "approved" : "pending",
        requestedAtMs: now,
        decidedAtMs: autoApproved ? now : undefined,
        note: autoApproved ? "autoApprove=true" : undefined,
        revisionCount: 0,
      },
      rolePlan: {
        ...rolePlan,
        roles,
      },
      roles,
      subtaskGraph,
      generatedSkills,
      expectedArtifacts: input.expectedArtifacts?.length
        ? unique(input.expectedArtifacts)
        : contract.expectedOutputs.map((output) => `${output.kind}: ${output.description}`),
      verificationPlan: input.verificationPlan?.length
        ? unique(input.verificationPlan)
        : defaultVerificationPlan(contract),
      riskAndPermissionNotes: input.riskAndPermissionNotes?.length
        ? unique(input.riskAndPermissionNotes)
        : defaultRiskAndPermissionNotes(contract),
      contract,
      acceptanceCriteria: contract.acceptanceCriteria,
      maxSteps: Math.min(50, Math.max(1, Math.trunc(input.maxSteps ?? defaultMaxSteps(subtaskGraph.length || roles.length)))),
      status: autoApproved ? "running" : "needs_followup",
      createdAtMs: now,
      updatedAtMs: now,
    };
    const createdSubtasks: Array<{ subtaskId: string; role: string; taskId: string }> = [];
    const taskBySubtaskId = new Map<string, string>();
    record.subtaskGraph = record.subtaskGraph.map((subtask) => {
      const taskId = this.state.createTask({
        runId: input.runId,
        agent: subtask.assigneeRole,
        title: subtask.title,
        detail: [
          `workflow=${id}`,
          `subtask=${subtask.id}`,
          `role=${subtask.assigneeRole}`,
          subtask.description ? `detail=${compact(subtask.description, 240)}` : "",
          subtask.acceptanceCriteria.length ? `acceptance=${subtask.acceptanceCriteria.join(" | ")}` : "",
          subtask.expectedOutputs.length ? `outputs=${subtask.expectedOutputs.join(" | ")}` : "",
        ].filter(Boolean).join(" "),
        status: autoApproved ? "queued" : "paused",
      });
      taskBySubtaskId.set(subtask.id, taskId);
      createdSubtasks.push({ subtaskId: subtask.id, role: subtask.assigneeRole, taskId });
      return {
        ...subtask,
        taskId,
        status: autoApproved ? subtask.status : "queued",
        updatedAtMs: now,
      };
    });
    for (const subtask of record.subtaskGraph) {
      const taskId = subtask.taskId;
      if (!taskId) continue;
      for (const dependency of subtask.dependencies) {
        const dependencyTaskId = taskBySubtaskId.get(dependency);
        if (dependencyTaskId) this.state.addTaskDependency(taskId, dependencyTaskId);
      }
    }
    record.roles = record.roles.map((role) => ({
      ...role,
      status: role.role === "Planner" ? "succeeded" : autoApproved ? "queued" : "idle",
      taskIds: record.subtaskGraph.filter((subtask) => sameRole(subtask.assigneeRole, role.role) && subtask.taskId).map((subtask) => subtask.taskId!),
      assignedTasks: record.subtaskGraph.filter((subtask) => sameRole(subtask.assigneeRole, role.role)).map((subtask) => subtask.title),
      completedTasks: role.role === "Planner" ? ["Generated reviewable workflow plan."] : role.completedTasks,
    }));
    record.rolePlan = { ...record.rolePlan, roles: record.roles };
    this.save(record);
    this.setActiveWorkflowId(id);
    this.state.saveCheckpoint(input.runId, `agent_workflow:${id}:roles`, record);
    this.state.appendEvent(input.runId, "agent_workflow_plan_created", {
      workflow_id: id,
      objective: input.objective,
      phase: record.phase,
      approval_status: record.approvalState.status,
      contract,
      role_count: record.roles.length,
      roles: record.roles.map((role) => role.role),
      subtasks: createdSubtasks,
      generated_skills: record.generatedSkills.map((skill) => skill.id),
      expected_artifacts: record.expectedArtifacts,
      verification_plan: record.verificationPlan,
      risk_and_permission_notes: record.riskAndPermissionNotes,
    });
    for (const role of record.roles) {
      this.appendRoleTranscript(record.id, role.role, {
        role: "supervisor",
        kind: "system",
        text: role.role === "Planner"
          ? `Planner created a reviewable workflow plan for approval.`
          : `Planned role ${role.role}: ${role.responsibility}`,
        createdAtMs: now,
      });
      this.state.appendEvent(input.runId, "agent_workflow_role_task_created", {
        workflow_id: id,
        task_ids: role.taskIds,
        role: roleSummary(role),
      });
    }
    this.addMessage(id, {
      from: "supervisor",
      to: "all",
      message: autoApproved
        ? `Workflow plan auto-approved and execution started: ${input.objective}`
        : `Workflow plan is awaiting approval: ${input.objective}`,
      createdAtMs: now,
    });
    return record;
  }

  message(input: {
    runId: string;
    workflowId?: string;
    from: string;
    to: string;
    message: string;
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const entry: AgentWorkflowMessage = {
      from: input.from,
      to: input.to,
      message: input.message,
      createdAtMs: Date.now(),
    };
    this.addMessage(record.id, entry);
    for (const role of record.roles) {
      if (entry.to === "all" || entry.to === role.role || entry.from === role.role) {
        this.appendRoleTranscript(record.id, role.role, {
          role: entry.from,
          kind: "message",
          text: `${entry.from} -> ${entry.to}: ${entry.message}`,
          createdAtMs: entry.createdAtMs,
        });
      }
    }
    this.state.appendEvent(input.runId, "agent_workflow_message", {
      workflow_id: record.id,
      ...entry,
    });
    return this.touch(record.id);
  }

  approvePlan(input: {
    runId: string;
    workflowId?: string;
    note?: string;
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const now = Date.now();
    const next: AgentWorkflowRecord = {
      ...record,
      phase: "executing",
      status: "running",
      approvalState: {
        ...record.approvalState,
        status: "approved",
        decidedAtMs: now,
        note: input.note,
      },
      roles: record.roles.map((role) => ({
        ...role,
        status: role.role === "Planner" && role.status === "succeeded" ? "succeeded" : "queued",
      })),
      updatedAtMs: now,
    };
    this.save(next);
    for (const subtask of next.subtaskGraph) {
      if (subtask.taskId && ["queued", "running"].includes(subtask.status)) {
        this.state.updateTaskStatus(subtask.taskId, "queued", "workflow plan approved");
      }
    }
    this.state.appendEvent(input.runId, "agent_workflow_plan_approved", {
      workflow_id: next.id,
      note: input.note,
    });
    this.addMessage(next.id, {
      from: "user",
      to: "supervisor",
      message: input.note ? `Plan approved: ${input.note}` : "Plan approved.",
      createdAtMs: now,
    });
    return next;
  }

  replacePlan(input: {
    runId: string;
    workflowId?: string;
    instructions?: string;
    rolePlan?: WorkflowRolePlan;
    subtaskGraph?: WorkflowSubtaskState[];
    generatedSkills?: GeneratedRoleSkill[];
    expectedArtifacts?: string[];
    verificationPlan?: string[];
    riskAndPermissionNotes?: string[];
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const now = Date.now();
    const rolePlan = input.rolePlan ?? buildCleanWorkflowPlan(undefined, record.objective, record.contract ?? normalizeTaskCompletionContract(undefined, record.objective));
    let roles = ensurePlannerAndAcceptanceReviewer(rolePlan.roles, record.objective, record.contract ?? normalizeTaskCompletionContract(undefined, record.objective));
    const generatedSkills = normalizeGeneratedSkills(input.generatedSkills, roles, record.contract ?? normalizeTaskCompletionContract(undefined, record.objective));
    roles = attachGeneratedSkillsToRoles(roles, generatedSkills);
    let subtaskGraph = normalizeSubtaskGraph(
      input.subtaskGraph?.length ? input.subtaskGraph : buildCleanSubtasks(record.objective, record.contract ?? normalizeTaskCompletionContract(undefined, record.objective), roles),
      roles,
      record.contract ?? normalizeTaskCompletionContract(undefined, record.objective),
      now,
    );
    for (const task of this.state.listTasks(record.runId).filter((task) => task.detail.includes(`workflow=${record.id}`) && task.status !== "succeeded")) {
      this.state.updateTaskStatus(task.id, "cancelled", "workflow plan replaced before execution");
    }
    const taskBySubtaskId = new Map<string, string>();
    subtaskGraph = subtaskGraph.map((subtask) => {
      const taskId = this.state.createTask({
        runId: record.runId,
        agent: subtask.assigneeRole,
        title: subtask.title,
        detail: [
          `workflow=${record.id}`,
          `subtask=${subtask.id}`,
          `role=${subtask.assigneeRole}`,
          subtask.description ? `detail=${compact(subtask.description, 240)}` : "",
          subtask.acceptanceCriteria.length ? `acceptance=${subtask.acceptanceCriteria.join(" | ")}` : "",
        ].filter(Boolean).join(" "),
        status: "paused",
      });
      taskBySubtaskId.set(subtask.id, taskId);
      return { ...subtask, taskId, status: "queued", updatedAtMs: now };
    });
    for (const subtask of subtaskGraph) {
      if (!subtask.taskId) continue;
      for (const dependency of subtask.dependencies) {
        const dependencyTaskId = taskBySubtaskId.get(dependency);
        if (dependencyTaskId) this.state.addTaskDependency(subtask.taskId, dependencyTaskId);
      }
    }
    roles = roles.map((role) => ({
      ...role,
      status: role.role === "Planner" ? "succeeded" : "idle",
      taskIds: subtaskGraph.filter((subtask) => sameRole(subtask.assigneeRole, role.role) && subtask.taskId).map((subtask) => subtask.taskId!),
      assignedTasks: subtaskGraph.filter((subtask) => sameRole(subtask.assigneeRole, role.role)).map((subtask) => subtask.title),
      completedTasks: role.role === "Planner" ? ["Revised workflow plan."] : [],
    }));
    const next: AgentWorkflowRecord = {
      ...record,
      phase: "awaiting_approval",
      status: "needs_followup",
      approvalState: {
        required: true,
        status: "pending",
        requestedAtMs: now,
        revisionCount: record.approvalState.revisionCount + 1,
        note: input.instructions,
      },
      rolePlan: { ...rolePlan, roles },
      roles,
      subtaskGraph,
      generatedSkills,
      expectedArtifacts: input.expectedArtifacts ?? record.expectedArtifacts,
      verificationPlan: input.verificationPlan ?? record.verificationPlan,
      riskAndPermissionNotes: input.riskAndPermissionNotes ?? record.riskAndPermissionNotes,
      updatedAtMs: now,
    };
    this.save(next);
    this.state.appendEvent(input.runId, "agent_workflow_plan_replaced", {
      workflow_id: next.id,
      revision_count: next.approvalState.revisionCount,
      instructions: input.instructions,
      roles: next.roles.map((role) => role.role),
      subtasks: next.subtaskGraph.map((subtask) => ({ id: subtask.id, title: subtask.title, role: subtask.assigneeRole })),
    });
    this.addMessage(next.id, {
      from: "user",
      to: "Planner",
      message: input.instructions ? `Revise/regenerate plan: ${input.instructions}` : "Regenerate workflow plan.",
      createdAtMs: now,
    });
    return next;
  }

  cancelPlan(input: {
    runId: string;
    workflowId?: string;
    reason?: string;
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const now = Date.now();
    const next: AgentWorkflowRecord = {
      ...record,
      phase: "cancelled",
      status: "cancelled",
      approvalState: {
        ...record.approvalState,
        status: "cancelled",
        decidedAtMs: now,
        note: input.reason,
      },
      roles: record.roles.map((role) => ({
        ...role,
        status: role.status === "running" ? "idle" : role.status,
        lastMessage: input.reason ? `Workflow cancelled: ${input.reason}` : "Workflow cancelled.",
      })),
      subtaskGraph: record.subtaskGraph.map((subtask) => ({
        ...subtask,
        status: ["succeeded", "skipped"].includes(subtask.status) ? subtask.status : "skipped",
        lastEvent: input.reason ? `cancelled: ${input.reason}` : "cancelled",
        updatedAtMs: now,
      })),
      updatedAtMs: now,
    };
    this.save(next);
    for (const task of this.state.listTasks(record.runId).filter((task) => task.detail.includes(`workflow=${record.id}`) && task.status !== "succeeded")) {
      this.state.updateTaskStatus(task.id, "cancelled", input.reason ?? "workflow cancelled");
    }
    this.state.appendEvent(input.runId, "agent_workflow_plan_cancelled", {
      workflow_id: next.id,
      reason: input.reason,
    });
    return next;
  }

  claimNextRole(input: {
    workflowId?: string;
    role?: string;
  } = {}): { record: AgentWorkflowRecord; role: AgentRoleState; task?: TaskRecord } | undefined {
    const claimed = this.claimNextSubtask(input);
    return claimed ? { record: claimed.record, role: claimed.role, task: claimed.task } : undefined;
  }

  claimNextSubtask(input: {
    workflowId?: string;
    role?: string;
    subtaskId?: string;
  } = {}): { record: AgentWorkflowRecord; role: AgentRoleState; subtask: WorkflowSubtaskState; task?: TaskRecord } | undefined {
    let record = this.resolve(input.workflowId);
    if (record.status !== "running" && record.status === "needs_followup" && record.phase === "blocked") {
      record = { ...record, status: "running", phase: "executing", updatedAtMs: Date.now() };
      this.save(record);
    }
    if (record.status !== "running" || !["executing", "reviewing"].includes(record.phase)) return undefined;
    const selected = selectNextSubtask(record, input.role, input.subtaskId);
    if (!selected) return undefined;
    const executionRole = selected.status === "needs_review" ? "AcceptanceReviewer" : selected.assigneeRole;
    const role = record.roles.find((candidate) => sameRole(candidate.role, executionRole))
      ?? record.roles.find((candidate) => sameRole(candidate.role, selected.assigneeRole));
    if (!role) return undefined;
    const task = selected.taskId ? this.state.getTask(selected.taskId) : undefined;
    const now = Date.now();
    const updated = updateRole(updateSubtask(record, selected.id, (subtask) => ({
      ...subtask,
      status: "running",
      startedAtMs: subtask.startedAtMs ?? now,
      updatedAtMs: now,
      lastEvent: `started by ${role.role}`,
    })), role.role, (roleState) => ({
      ...roleState,
      status: "running",
      blockedBy: undefined,
      lastMessage: `Running subtask: ${selected.title}`,
    }));
    this.save(updated);
    if (task && task.status !== "running") {
      this.state.updateTaskStatus(task.id, "running", `workflow subtask ${selected.id} running by ${role.role}`);
    }
    this.state.appendEvent(record.runId, "agent_workflow_subtask_started", {
      workflow_id: record.id,
      subtask_id: selected.id,
      role: role.role,
      task_id: task?.id,
      title: selected.title,
    });
    return {
      record: updated,
      role: updated.roles.find((candidate) => candidate.role === role.role) ?? role,
      subtask: updated.subtaskGraph.find((subtask) => subtask.id === selected.id) ?? selected,
      task,
    };
  }

  recordRoleResult(input: {
    workflowId: string;
    role: string;
    taskId?: string;
    subtaskId?: string;
    envelopeActions?: ActionRequest[];
    report: ActionExecutionReport;
    roleStatus?: WorkflowRoleStatus;
    checkpoint?: string;
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const now = Date.now();
    const status: WorkflowRoleStatus = input.roleStatus ?? (input.report.status === "succeeded" ? "succeeded" : "blocked");
    const summary = compact([
      input.report.final_message,
      ...input.report.results.map((result) =>
        `${result.action_type}:${result.status}${result.path ? ` ${result.path}` : ""}${result.message ? ` ${compact(result.message, 160)}` : ""}`,
      ),
    ].filter(Boolean).join(" | "), 1400);
    const subtask = input.subtaskId
      ? record.subtaskGraph.find((candidate) => candidate.id === input.subtaskId)
      : input.taskId
        ? record.subtaskGraph.find((candidate) => candidate.taskId === input.taskId)
        : undefined;
    const nextSubtaskStatus = subtask
      ? nextSubtaskStatusForRole(record, subtask, input.role, status, input.report)
      : undefined;
    const updatedSubtasks = subtask && nextSubtaskStatus
      ? updateSubtask(record, subtask.id, (candidate) => ({
        ...candidate,
        status: nextSubtaskStatus,
        evidence: input.report.results.some((result) => result.status === "succeeded")
          ? unique([
            ...candidate.evidence,
            ...input.report.results
              .filter((result) => result.status === "succeeded")
              .map((result) => `${result.action_type}${result.path ? `:${result.path}` : ""}${result.message ? ` ${compact(result.message, 180)}` : ""}`),
          ]).slice(-20)
          : candidate.evidence,
        blockedBy: nextSubtaskStatus === "blocked" || nextSubtaskStatus === "failed" ? summary : undefined,
        repairHint: nextSubtaskStatus === "blocked" || nextSubtaskStatus === "failed" ? "Continue or revise the plan after repairing the concrete blocker." : candidate.repairHint,
        completedAtMs: ["succeeded", "skipped"].includes(nextSubtaskStatus) ? now : candidate.completedAtMs,
        updatedAtMs: now,
        lastEvent: summary,
      }))
      : record;
    const updated = updateRole(updatedSubtasks, input.role, (role) => ({
      ...role,
      status: roleStatusAfterSubtask(updatedSubtasks, role, status),
      completedTasks: status === "succeeded"
        ? unique([...role.completedTasks, ...(subtask ? [subtask.title] : role.assignedTasks.slice(0, 1))])
        : role.completedTasks,
      toolResultSummary: unique([...role.toolResultSummary, summary]).slice(-20),
      transcript: [
        ...role.transcript,
        {
          role: input.role,
          kind: "tool" as const,
          text: summary,
          createdAtMs: now,
        },
      ].slice(-80),
      checkpoint: input.checkpoint ?? summary,
      lastMessage: input.report.final_message || summary,
      blockedBy: status === "blocked" || status === "failed" ? summary : undefined,
    }));
    this.save(updated);
    const taskId = input.taskId ?? subtask?.taskId ?? updated.roles.find((role) => role.role === input.role)?.taskIds[0];
    if (taskId) {
      this.state.updateTaskStatus(
        taskId,
        taskStatusForSubtask(nextSubtaskStatus, status),
        summary,
      );
    }
    this.state.saveCheckpoint(record.runId, `agent_workflow:${record.id}:${input.role}:checkpoint`, {
      role: input.role,
      status,
      summary,
      action_count: input.envelopeActions?.length ?? 0,
      result_count: input.report.results.length,
    });
    this.state.appendEvent(record.runId, "agent_workflow_role_completed", {
      workflow_id: record.id,
      role: input.role,
      subtask_id: subtask?.id,
      task_id: taskId,
      status,
      subtask_status: nextSubtaskStatus,
      summary,
      actions: input.envelopeActions?.map((action) => action.type) ?? [],
    });
    const finalized = this.finalizeIfWorkflowComplete(updated);
    return finalized;
  }

  recordRoleToolEvent(input: {
    workflowId: string;
    role: string;
    taskId?: string;
    subtaskId?: string;
    phase: "start" | "finish";
    action: ActionRequest;
    resultStatus?: string;
    message?: string;
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const text = compact([
      input.phase,
      input.action.type,
      input.resultStatus,
      input.message,
    ].filter(Boolean).join(" "), 500);
    const updated = updateRole(record, input.role, (role) => ({
      ...role,
      lastMessage: text,
      toolResultSummary: input.phase === "finish" ? unique([...role.toolResultSummary, text]).slice(-20) : role.toolResultSummary,
      transcript: [
        ...role.transcript,
        {
          role: input.role,
          kind: "tool" as const,
          text,
          createdAtMs: Date.now(),
        },
      ].slice(-80),
    }));
    this.save(updated);
    this.state.appendEvent(record.runId, `agent_workflow_tool_${input.phase}`, {
      workflow_id: record.id,
      role: input.role,
      subtask_id: input.subtaskId,
      task_id: input.taskId,
      action: input.action,
      result_status: input.resultStatus,
      message: input.message,
    });
    return updated;
  }

  finish(input: {
    runId: string;
    workflowId?: string;
    status: AgentWorkflowRecord["status"];
    summary: string;
    artifacts?: string[];
    issues?: string[];
  }): AgentWorkflowRecord {
    const record = this.resolve(input.workflowId);
    const next: AgentWorkflowRecord = {
      ...record,
      roles: record.roles.map((role) => ({
        ...role,
        status: role.status === "running" || role.status === "queued" ? "idle" : role.status,
        lastMessage: role.role.toLowerCase().includes("review") ? input.summary : role.lastMessage,
      })),
      status: input.status,
      phase: input.status === "succeeded" ? "completed" : input.status === "failed" ? "blocked" : record.phase,
      updatedAtMs: Date.now(),
    };
    this.save(next);
    this.state.saveCheckpoint(input.runId, `agent_workflow:${next.id}:final`, {
      ...next,
      summary: input.summary,
      artifacts: input.artifacts ?? [],
      issues: input.issues ?? [],
    });
    this.state.appendEvent(input.runId, "agent_workflow_finished", {
      workflow_id: next.id,
      status: input.status,
      summary: input.summary,
      artifacts: input.artifacts ?? [],
      issues: input.issues ?? [],
    });
    if (input.status === "succeeded") {
      for (const task of this.state.listTasks(input.runId).filter((task) => task.detail.includes(`workflow=${next.id}`))) {
        if (task.status !== "succeeded") {
          this.state.updateTaskStatus(task.id, "succeeded", "workflow finished");
        }
      }
    }
    return next;
  }

  status(workflowId?: string): {
    record: AgentWorkflowRecord;
    tasks: TaskRecord[];
    messages: AgentWorkflowMessage[];
  } {
    const record = this.resolve(workflowId);
    return {
      record,
      tasks: this.state.listTasks(record.runId).filter((task) => task.detail.includes(`workflow=${record.id}`)),
      messages: this.messages(record.id),
    };
  }

  formatStatus(workflowId?: string): string {
    const { record, tasks, messages } = this.status(workflowId);
    const taskByAgent = new Map(tasks.map((task) => [task.agent, task]));
    const subtaskCounts = countSubtasks(record.subtaskGraph);
    const counts = {
      total: tasks.length,
      done: tasks.filter((task) => task.status === "succeeded").length,
      running: tasks.filter((task) => task.status === "running").length,
      pending: tasks.filter((task) => task.status === "queued" || task.status === "paused").length,
      failed: tasks.filter((task) => task.status === "failed").length,
    };
    return [
      "DeepSeekCode agent workflow",
      `workflow_id: ${record.id}`,
      `status: ${record.status}`,
      `phase: ${record.phase}`,
      `approval: ${record.approvalState.status}${record.approvalState.note ? ` (${compact(record.approvalState.note, 160)})` : ""}`,
      `objective: ${record.objective}`,
      record.contract ? `contract_outputs: ${record.contract.expectedOutputs.map((output) => `${output.kind}:${output.description}${output.required ? "" : " optional"}`).join(" | ") || "(none)"}` : "",
      `progress: ${counts.done}/${counts.total} done, running=${counts.running}, pending=${counts.pending}, failed=${counts.failed}`,
      `subtasks: ${subtaskCounts.succeeded}/${subtaskCounts.total} succeeded, queued=${subtaskCounts.queued}, running=${subtaskCounts.running}, review=${subtaskCounts.needs_review}, blocked=${subtaskCounts.blocked}, failed=${subtaskCounts.failed}`,
      record.rolePlan.plannerNotes ? `planner_notes: ${compact(record.rolePlan.plannerNotes, 300)}` : "",
      "",
      "roles:",
      ...record.roles.map((role) => {
        const task = taskByAgent.get(role.role);
        return [
          `- ${role.role} [${role.status}; task=${task?.status ?? "defined"}]: ${role.responsibility}`,
          role.contextScope ? `  scope: ${role.contextScope}` : "",
          role.assignedTasks.length ? `  assigned: ${role.assignedTasks.join(" | ")}` : "",
          role.completedTasks.length ? `  completed: ${role.completedTasks.join(" | ")}` : "",
          role.preloadedSkills.length ? `  skills: ${role.preloadedSkills.join(", ")}` : "",
          role.allowedTools.length ? `  tools: ${role.allowedTools.join(", ")}` : "",
          role.acceptance.length ? `  acceptance: ${role.acceptance.join(" | ")}` : "",
          role.blockedBy ? `  blocked: ${compact(role.blockedBy, 240)}` : "",
          role.checkpoint ? `  checkpoint: ${compact(role.checkpoint, 240)}` : "",
        ].filter(Boolean).join("\n");
      }),
      record.subtaskGraph.length ? "\nsubtasks:" : "",
      ...record.subtaskGraph.map((subtask) => [
        `- ${subtask.id} [${subtask.status}] ${subtask.title}`,
        `  role: ${subtask.assigneeRole}`,
        subtask.dependencies.length ? `  depends_on: ${subtask.dependencies.join(", ")}` : "",
        subtask.evidence.length ? `  evidence: ${subtask.evidence.slice(-3).join(" | ")}` : "",
        subtask.blockedBy ? `  blocked: ${compact(subtask.blockedBy, 240)}` : "",
      ].filter(Boolean).join("\n")),
      record.acceptanceCriteria.length ? `\nworkflow acceptance: ${record.acceptanceCriteria.join(" | ")}` : "",
      messages.length ? `latest message: ${messages.at(-1)?.from} -> ${messages.at(-1)?.to}: ${messages.at(-1)?.message}` : "",
      record.phase === "awaiting_approval"
        ? "next: approve_agent_workflow_plan executes; revise_agent_workflow_plan/regenerate_agent_workflow_plan changes the plan; cancel_agent_workflow_plan cancels."
        : "next: run_agent_workflow_step/drain_agent_workflow continues subtask-local work; AcceptanceReviewer must verify evidence before finish_agent_workflow.",
    ].filter(Boolean).join("\n");
  }

  activeWorkflowId(): string | undefined {
    return this.state.getUiState<string>(this.scope, "active");
  }

  private resolve(workflowId?: string): AgentWorkflowRecord {
    const id = workflowId?.trim() || this.activeWorkflowId();
    if (!id) throw new Error("No active agent workflow. Call start_agent_workflow first.");
    const record = this.state.getUiState<AgentWorkflowRecord>(this.scope, id);
    if (!record) throw new Error(`agent workflow not found: ${id}`);
    return migrateRecord(record);
  }

  private roleTask(record: AgentWorkflowRecord, role: AgentRoleState): TaskRecord | undefined {
    const tasks = this.state.listTasks(record.runId);
    return tasks.find((task) => role.taskIds.includes(task.id)) ?? tasks.find((task) => task.agent === role.role && task.detail.includes(`workflow=${record.id}`));
  }

  private save(record: AgentWorkflowRecord): void {
    this.state.setUiState(this.scope, record.id, {
      ...record,
      updatedAtMs: Date.now(),
    });
  }

  private touch(workflowId: string): AgentWorkflowRecord {
    const record = this.resolve(workflowId);
    this.save(record);
    return this.resolve(workflowId);
  }

  private setActiveWorkflowId(id: string): void {
    this.state.setUiState(this.scope, "active", id);
  }

  private addMessage(workflowId: string, message: AgentWorkflowMessage): void {
    const key = `messages:${workflowId}`;
    const messages = this.state.getUiState<AgentWorkflowMessage[]>(this.scope, key) ?? [];
    this.state.setUiState(this.scope, key, [...messages, message].slice(-200));
  }

  private messages(workflowId: string): AgentWorkflowMessage[] {
    return this.state.getUiState<AgentWorkflowMessage[]>(this.scope, `messages:${workflowId}`) ?? [];
  }

  private appendRoleTranscript(workflowId: string, roleName: string, entry: AgentWorkflowTranscriptEntry): void {
    const record = this.resolve(workflowId);
    const next = updateRole(record, roleName, (role) => ({
      ...role,
      transcript: [...role.transcript, entry].slice(-80),
      lastMessage: entry.text,
    }));
    this.save(next);
  }

  private finalizeIfWorkflowComplete(record: AgentWorkflowRecord): AgentWorkflowRecord {
    const next = this.resolve(record.id);
    if (next.status !== "running" || !["executing", "reviewing"].includes(next.phase)) return next;
    if (next.subtaskGraph.some((subtask) => subtask.status === "needs_review") && next.phase !== "reviewing") {
      const reviewing: AgentWorkflowRecord = { ...next, phase: "reviewing", updatedAtMs: Date.now() };
      this.save(reviewing);
      this.state.appendEvent(next.runId, "agent_workflow_reviewing", {
        workflow_id: next.id,
        needs_review: next.subtaskGraph.filter((subtask) => subtask.status === "needs_review").map((subtask) => subtask.id),
      });
      return reviewing;
    }
    const hardFailures = next.subtaskGraph.filter((subtask) => subtask.status === "failed");
    if (hardFailures.length > 0) {
      return this.finish({
        runId: next.runId,
        workflowId: next.id,
        status: "failed",
        summary: "One or more workflow subtasks failed.",
        issues: hardFailures.map((subtask) => `${subtask.title}: ${subtask.blockedBy ?? "failed"}`),
      });
    }
    const blocked = next.subtaskGraph.filter((subtask) => subtask.status === "blocked");
    if (blocked.length > 0) {
      const blockedRecord: AgentWorkflowRecord = { ...next, phase: "blocked", status: "needs_followup", updatedAtMs: Date.now() };
      this.save(blockedRecord);
      return blockedRecord;
    }
    if (next.subtaskGraph.length > 0 && next.subtaskGraph.every((subtask) => subtask.status === "succeeded" || subtask.status === "skipped")) {
      return this.finish({
        runId: next.runId,
        workflowId: next.id,
        status: "succeeded",
        summary: "All workflow subtasks completed and acceptance evidence was recorded.",
      });
    }
  return next;
  }
}

function buildCleanWorkflowPlan(
  roles: AgentRoleSpec[] | undefined,
  objective: string,
  contract: NormalizedTaskCompletionContract,
): WorkflowRolePlan {
  const explicitRoles = roles?.length
    ? roles.map((role) => roleState({
      role: safeRoleName(role.role ?? role.name ?? "agent"),
      responsibility: role.responsibility.trim(),
      contextScope: role.contextScope ?? "只读取任务契约、当前项目摘要、分配给自己的子任务、必要上游摘要、工具结果摘要和自己的 checkpoint。",
      allowedTools: unique([...(role.allowedTools ?? []), ...(role.tools ?? [])]),
      preloadedSkills: unique([...(role.preloadedSkills ?? []), ...(role.skills ?? [])]),
      assignedTasks: unique(role.assignedTasks?.length ? role.assignedTasks : [role.responsibility]),
      acceptance: unique([...(role.acceptance ?? []), ...(role.acceptanceCriteria ?? [])]),
      requiredOutputs: unique(role.requiredOutputs ?? []),
      riskChecks: unique(role.riskChecks ?? []),
      handoffFormat: role.handoffFormat ?? "中文摘要；改动路径；产物/URL/命令；验证 evidence；阻塞与下一步。",
      checkpoint: role.checkpoint ?? "",
    }))
    : [];
  const planner = roleState({
    role: "Planner",
    responsibility: `为任务生成可审查计划、动态角色、子任务图、验收顺序和确认交接：${objective}`,
    contextScope: "读取目标、任务契约、项目结构、用户约束和 runtime state；只持久化计划、角色、子任务与风险摘要。",
    allowedTools: ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills", "send_agent_message", "agent_status"],
    preloadedSkills: ["workflow-planning", ...skillsForContract(contract)],
    assignedTasks: ["执行前生成可确认的 plan gate payload。"],
    acceptance: ["计划必须包含任务定制动态角色、角色本地 skill、子任务、依赖、evidence 要求和验收 gate。"],
    requiredOutputs: ["rolePlan", "subtaskGraph", "generatedSkills", "verificationPlan"],
    riskChecks: ["中间角色必须来自任务需求，不使用固定模板凑数。", "每个角色只读取自己的上下文、工具摘要和必要上游摘要。"],
    handoffFormat: "用中文返回角色、子任务交接、验收标准和 evidence 要求。",
  });
  const middleRoles = explicitRoles.filter((role) => !isPlannerRole(role.role) && !isAcceptanceRole(role.role));
  const dynamicRoles = middleRoles.length ? middleRoles : cleanExecutionRoles(objective, contract);
  const reviewer = roleState({
    role: "AcceptanceReviewer",
    responsibility: "按任务契约、子任务 evidence、真实产物、verification hints 和用户约束验收每个子任务与最终结果。",
    contextScope: "读取 contract、子任务 evidence、角色 checkpoint、验证摘要和产物；除非定位失败，不读取其他角色完整 transcript。",
    allowedTools: ["read_file", "list_files", "glob_files", "grep_files", "validate_artifact", "verify_task", "verify_project", "launch_project", "browser_screenshot", "agent_status", "finish_agent_workflow"],
    preloadedSkills: ["acceptance-review", "artifact-review", "runtime-verification", ...skillsForContract(contract)],
    assignedTasks: ["验收 needs_review 子任务，并且只在真实 evidence 存在后结束 workflow。"],
    acceptance: contract.acceptanceCriteria.length ? contract.acceptanceCriteria : [
      "必须产物或行为真实存在。",
      "验收使用真实文件、命令、启动、截图、validator 或明确 blocker。",
      "已知限制必须如实报告。",
    ],
    requiredOutputs: ["acceptanceDecision", "remainingIssues", "artifactEvidence"],
    riskChecks: ["不得只凭文字说明标记完成。", "产物缺失、打不开、按钮无响应或预览失败时必须拒绝验收。"],
    handoffFormat: "逐项说明通过/拒绝、使用的 evidence，以及拒绝后的修复步骤。",
  });
  return {
    source: middleRoles.length ? "user" : "heuristic",
    plannerNotes: middleRoles.length
      ? "用户提供了中间角色；系统只补齐 Planner 和 AcceptanceReviewer。"
      : "本地兜底根据任务契约生成中文动态角色；模型可通过 start_agent_workflow 参数替换这份计划。",
    roles: [planner, ...dynamicRoles, reviewer],
  };
}

function cleanExecutionRoles(objective: string, contract: NormalizedTaskCompletionContract): AgentRoleState[] {
  return cleanRoleSpecs(objective, contract)
    .slice(0, roleLimitForContract(contract, objective))
    .map((spec) => roleState({
      role: spec.role,
      responsibility: spec.responsibility,
      contextScope: "只读取当前子任务、角色专属 skill、必要文件、上游摘要、工具反馈和自己的 checkpoint；不读取其他角色完整 transcript。",
      allowedTools: unique(spec.tools),
      preloadedSkills: unique(spec.skills),
      assignedTasks: unique(spec.outputs.length ? spec.outputs.map((output) => `完成或修复：${output}`) : [spec.responsibility]),
      acceptance: ["产物、命令、截图、日志摘要或明确 blocker 必须形成 evidence。", "交接必须写清路径、启动命令、验证结果和下一位角色需要关注的问题。"],
      requiredOutputs: unique(spec.outputs.length ? spec.outputs : ["本地产物与验证 evidence"]),
      riskChecks: unique(spec.risks),
      handoffFormat: "中文摘要；改动路径；产物/URL/命令；验证 evidence；阻塞与建议。",
    }));
}

function cleanRoleSpecs(objective: string, contract: NormalizedTaskCompletionContract): Array<{
  role: string;
  responsibility: string;
  tools: string[];
  skills: string[];
  outputs: string[];
  risks: string[];
}> {
  const commonRead = ["read_file", "list_files", "grep_files", "glob_files"];
  const commonWrite = [...commonRead, "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "validate_artifact"];
  const runtimeTools = [...commonWrite, "launch_project", "browser_screenshot", "verify_task"];
  const text = [
    objective,
    ...contract.expectedOutputs.map((output) => `${output.kind} ${output.description}`),
    ...contract.acceptanceCriteria,
    ...contract.verificationHints,
  ].join("\n").toLowerCase();
  const specs: Array<{
    role: string;
    responsibility: string;
    tools: string[];
    skills: string[];
    outputs: string[];
    risks: string[];
  }> = [];
  const add = (role: string, responsibility: string, outputs: string[], skills: string[], tools = commonWrite, risks: string[] = []) => {
    if (!specs.some((candidate) => candidate.role === role)) specs.push({ role, responsibility, tools, skills, outputs, risks });
  };
  const isWeb = /网站|网页|页面|前端|浏览器|html|css|react|vue|vite|next|商城|电商|web|frontend|browser|website|page|shop|ecommerce/.test(text);
  const isGame = /游戏|小游戏|关卡|敌机|子弹|碰撞|分数|战机|game|level|enemy|bullet|collision|score/.test(text);
  const hasMotion = /动效|动画|gsap|motion|scroll|过渡|特效|animate|animation/.test(text);
  const hasBackend = /后端|接口|api|服务端|server|backend|express|fastify/.test(text);
  const hasData = /数据库|数据|schema|seed|种子|商品|库存|catalog|csv|json|db|sqlite|mysql|postgres|data/.test(text);
  if (isGame) {
    add("玩法与关卡工程师", `实现游戏核心玩法、关卡节奏、状态循环、碰撞/计分/生命等可玩行为：${objective}`, ["玩法逻辑", "关卡状态", "可运行游戏 evidence"], ["implementation", "browser-verification"], runtimeTools, ["不能只做静态页面；必须能启动、可交互或记录明确 blocker。"]);
  }
  if (isWeb) {
    add("界面与交互工程师", `实现浏览器入口、页面结构、响应式布局和用户可见交互：${objective}`, ["浏览器入口", "响应式界面", "主要交互流程"], ["ui-ux", "browser-verification"], runtimeTools, ["检查空白页、404、控制台错误、按钮无响应和手机端溢出。"]);
  }
  if (hasMotion) {
    add("动效体验工程师", `实现 GSAP/动画时序、状态反馈、过渡和动效性能：${objective}`, ["动画时间线", "动效验证 evidence", "低动效模式说明"], ["gsap-core", "gsap-timeline", "gsap-performance", "ui-ux"], runtimeTools, ["优先 transform/opacity；避免布局抖动和无意义装饰动效。"]);
  }
  if (hasBackend) {
    add("后端接口工程师", `实现服务端、API、启动脚本、端口和前后端联调：${objective}`, ["后端/API 代码", "启动命令", "接口验证 evidence"], ["implementation", "testing"], commonWrite, ["长服务必须走 launch_project；有限命令必须可退出。"]);
  }
  if (contract.expectedOutputs.some((output) => ["code", "cli"].includes(String(output.kind).toLowerCase())) && !specs.some((spec) => spec.role === "后端接口工程师")) {
    add("项目实现工程师", `实现可执行代码、CLI、脚本、测试或包配置：${objective}`, ["代码实现", "有限命令验证 evidence"], ["implementation", "testing"], commonWrite, ["只使用可结束的有限命令；重试前先修复 Windows shell 不兼容。"]);
  }
  if (hasData) {
    add("数据建模工程师", `实现数据库 schema、seed、数据文件和可复现实例数据：${objective}`, ["schema/seed 数据", "数据验证 evidence"], ["spreadsheets", "data-validation", "implementation"], commonWrite, ["不得伪造数据完成状态；记录初始化和读取验证。"]);
  }
  if (/mcp|model context protocol/.test(text)) {
    add("MCP 协议工程师", `实现 MCP mock、discover/call、错误摘要和协议验证：${objective}`, ["MCP discover/call evidence", "失败摘要"], ["mcp", "integration-testing"], [...commonWrite, "mcp_call"], ["无凭据时使用 mock 并明确标注。"]);
  }
  if (/ppt|pptx|slides?|演示|幻灯/.test(text)) {
    add("演示文稿设计师", `实现 PPTX 内容结构、版式和可打开性验证：${objective}`, ["PPTX 文件", "预览或验证 evidence"], ["presentations"], [...commonWrite, "create_pptx"], ["页数和文件可打开性必须验证。"]);
  }
  if (/docx?|word|文档|报告|markdown|pdf/.test(text)) {
    add("文档产物编辑", `实现文档/PDF/Markdown 结构、内容和格式验证：${objective}`, ["文档产物", "格式验证 evidence"], ["documents", "pdf", "writing"], [...commonWrite, "create_docx"], ["结构和可读性必须验证。"]);
  }
  if (!specs.length) {
    for (const output of contract.expectedOutputs.length ? contract.expectedOutputs : [{ kind: "code", description: objective, required: true }]) {
      const kind = String(output.kind).toLowerCase();
      if (kind === "cli" || kind === "code") {
        add(kind === "cli" ? "命令行工程师" : "项目实现工程师", `实现可执行代码、CLI、脚本、测试或包配置：${objective}`, [`${output.kind}: ${output.description}`], ["implementation", "testing"], commonWrite, ["只使用可结束的有限命令；重试前先修复 Windows shell 不兼容。"]);
      } else {
        add("项目实现工程师", `实现用户请求的本地产物并提供真实 evidence：${objective}`, [`${output.kind}: ${output.description}`], skillsForContract(contract), commonWrite, ["不得用文字替代真实产物。"]);
      }
    }
    add("运行修复工程师", `运行检查、归纳失败并修复可复现问题：${objective}`, ["检查记录", "修复 evidence"], ["testing", "browser-verification"], runtimeTools, ["失败必须保留第一行错误、完整日志位置和修复建议。"]);
  }
  return specs;
}

function buildCleanSubtasks(
  objective: string,
  contract: NormalizedTaskCompletionContract,
  roles: AgentRoleState[],
): WorkflowSubtaskState[] {
  const now = Date.now();
  const executionRoles = roles.filter((role) => !isPlannerRole(role.role) && !isAcceptanceRole(role.role));
  return executionRoles.map((role, index) => {
    const id = `subtask_${index + 1}`;
    const dependsOn = index === 0 ? [] : [`subtask_${index}`];
    return {
      id,
      title: role.assignedTasks[0] || `${role.role} 子任务`,
      description: role.responsibility || objective,
      assigneeRole: role.role,
      dependencies: dependsOn,
      status: "queued",
      acceptanceCriteria: role.acceptance.length ? role.acceptance : contract.acceptanceCriteria,
      expectedOutputs: role.requiredOutputs.length ? role.requiredOutputs : contract.expectedOutputs.map((output) => `${output.kind}: ${output.description}`),
      evidence: [],
      createdBy: "Planner",
      updatedAtMs: now,
    };
  });
}

function buildHeuristicWorkflowPlan(
  roles: AgentRoleSpec[] | undefined,
  objective: string,
  contract: NormalizedTaskCompletionContract,
): WorkflowRolePlan {
  const explicitRoles = roles?.length
    ? roles.map((role) => roleState({
      role: safeRoleName(role.role ?? role.name ?? "agent"),
      responsibility: role.responsibility.trim(),
      contextScope: role.contextScope ?? "Role-local context: use project state, assigned task, previous role summaries, and this role's tool history.",
      allowedTools: unique([...(role.allowedTools ?? []), ...(role.tools ?? [])]),
      preloadedSkills: unique([...(role.preloadedSkills ?? []), ...(role.skills ?? [])]),
      assignedTasks: unique(role.assignedTasks?.length ? role.assignedTasks : [role.responsibility]),
      acceptance: unique([...(role.acceptance ?? []), ...(role.acceptanceCriteria ?? [])]),
      requiredOutputs: unique(role.requiredOutputs ?? []),
      riskChecks: unique(role.riskChecks ?? []),
      handoffFormat: role.handoffFormat,
      checkpoint: role.checkpoint ?? "",
    }))
    : [];
  const planner = roleState({
    role: "Planner",
    responsibility: `为任务生成可审查计划、动态角色、子任务图、验收顺序和确认交接：${objective}`,
    contextScope: "读取目标、任务契约、项目结构、约束和 runtime state；只持久化角色与子任务摘要。",
    allowedTools: ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills", "send_agent_message", "agent_status"],
    preloadedSkills: ["workflow-planning", ...skillsForContract(contract)],
    assignedTasks: ["执行前生成可确认的 plan gate payload。"],
    acceptance: ["计划必须包含动态角色、角色本地 skill、子任务、依赖、evidence 要求和验收 gate。"],
    requiredOutputs: ["rolePlan", "subtaskGraph", "generatedSkills", "verificationPlan"],
    riskChecks: ["除非任务确实需要，不要使用固定中间角色。", "每个角色只能读取自己的上下文、工具摘要和必要上游摘要。"],
    handoffFormat: "用中文返回角色/子任务交接、验收标准和 evidence 要求。",
  });
  const executionRoles = explicitRoles.filter((role) => !isPlannerRole(role.role) && !isAcceptanceRole(role.role));
  const dynamicRoles = executionRoles.length ? executionRoles : heuristicExecutionRoles(objective, contract);
  const reviewer = roleState({
    role: "AcceptanceReviewer",
    responsibility: "按任务契约、子任务 evidence、真实产物、verification hints 和用户约束验收每个子任务与最终结果。",
    contextScope: "读取 contract、子任务 evidence、角色 checkpoint、验证摘要和产物；除非定位失败，不读取其他角色完整 transcript。",
    allowedTools: ["read_file", "list_files", "glob_files", "grep_files", "validate_artifact", "verify_task", "verify_project", "launch_project", "browser_screenshot", "agent_status", "finish_agent_workflow"],
    preloadedSkills: ["acceptance-review", "artifact-review", "runtime-verification", ...skillsForContract(contract)],
    assignedTasks: ["验收 needs_review 子任务，并且只在真实 evidence 存在后结束 workflow。"],
    acceptance: contract.acceptanceCriteria.length ? contract.acceptanceCriteria : [
      "必需产物或行为真实存在。",
      "验收使用真实文件、命令、启动、截图、validator 或明确 blocker。",
      "已知限制必须如实报告。",
    ],
    requiredOutputs: ["acceptanceDecision", "remainingIssues", "artifactEvidence"],
    riskChecks: ["不得只凭文字说明标记完成。", "必需产物缺失或无法打开时必须拒绝验收。"],
    handoffFormat: "逐项说明通过/拒绝、使用的 evidence，以及拒绝后的修复步骤。",
  });
  return {
    source: explicitRoles.length ? "user" : "heuristic",
    plannerNotes: explicitRoles.length
      ? "User supplied middle roles; Planner and AcceptanceReviewer were normalized around them."
      : "Heuristic fallback generated task-specific middle roles from expected output kinds. A provider can replace this with a model-authored role plan.",
    roles: [planner, ...dynamicRoles, reviewer],
  };
}

function heuristicExecutionRoles(objective: string, contract: NormalizedTaskCompletionContract): AgentRoleState[] {
  const outputs = contract.expectedOutputs.length
    ? contract.expectedOutputs
    : [{ kind: "unknown", description: objective, required: true }];
  const objectiveFallback = outputs.length === 1 && outputs[0]?.kind === "unknown"
    ? roleSpecsForObjective(objective, contract)
    : [];
  if (objectiveFallback.length) {
    return objectiveFallback.slice(0, roleLimitForContract(contract, objective)).map((spec) => roleState({
      role: spec.role,
      responsibility: spec.responsibility,
      contextScope: "只读取当前子任务、角色专属 skill、必要的上游摘要、工具结果摘要和自己的 checkpoint；不读取其他角色完整 transcript。",
      allowedTools: unique(spec.tools),
      preloadedSkills: unique(spec.skills),
      assignedTasks: unique(spec.outputs.map((output) => `完成或修复：${output}`)),
      acceptance: ["产物、命令、截图、日志摘要或明确 blocker 必须形成 evidence。", "交接必须写清路径、启动命令、验证结果和下一位角色需要关注的问题。"],
      requiredOutputs: unique(spec.outputs),
      riskChecks: unique(spec.risks),
      handoffFormat: "中文摘要；改动路径；产物/URL/命令；验证 evidence；阻塞与建议。",
    }));
  }
  const specs = new Map<string, {
    role: string;
    responsibility: string;
    tools: string[];
    skills: string[];
    outputs: string[];
    risks: string[];
  }>();
  for (const output of outputs) {
    const key = roleKeyForOutput(output.kind, output.description);
    const existing = specs.get(key);
    const base = existing ?? roleSpecForOutput(output.kind, output.description, objective);
    base.outputs.push(`${output.kind}: ${output.description}`);
    specs.set(key, base);
  }
  const roles = [...specs.values()].slice(0, roleLimitForContract(contract, objective)).map((spec) => roleState({
    role: spec.role,
    responsibility: spec.responsibility,
    contextScope: "只读取当前子任务、角色专属 skill、必要文件、上游摘要、工具反馈和自己的 checkpoint。",
    allowedTools: unique(spec.tools),
    preloadedSkills: unique(spec.skills),
    assignedTasks: unique(spec.outputs.map((output) => `完成或修复：${output}`)),
    acceptance: ["负责的输出必须存在，或给出带 evidence 的精确 blocker。", "交接包含路径、命令、预览或验证 evidence。"],
    requiredOutputs: unique(spec.outputs),
    riskChecks: unique(spec.risks),
    handoffFormat: "中文摘要；改动路径；产物/命令/预览；验证 evidence；阻塞；下一步验收关注点。",
  }));
  return roles.length ? roles : [roleState({
    role: "项目实现工程师",
    responsibility: `按用户目标完成本地产物，并提供可验证 evidence：${objective}`,
    allowedTools: ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "validate_artifact"],
    preloadedSkills: skillsForContract(contract),
    assignedTasks: [`完成用户请求的本地产物：${objective}`],
    requiredOutputs: ["本地产物与验证 evidence"],
    riskChecks: ["没有真实文件、命令、截图、URL、validator 或明确 blocker 时不得声称完成。"],
  })];
}

function roleSpecsForObjective(objective: string, contract: NormalizedTaskCompletionContract): Array<{
  role: string;
  responsibility: string;
  tools: string[];
  skills: string[];
  outputs: string[];
  risks: string[];
}> {
  const commonRead = ["read_file", "list_files", "grep_files", "glob_files"];
  const commonWrite = [...commonRead, "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "validate_artifact"];
  const text = `${objective}\n${contract.acceptanceCriteria.join("\n")}`.toLowerCase();
  const roles: Array<{
    role: string;
    responsibility: string;
    tools: string[];
    skills: string[];
    outputs: string[];
    risks: string[];
  }> = [];
  const add = (role: string, responsibility: string, outputs: string[], skills: string[], tools = commonWrite, risks: string[] = []) => {
    if (!roles.some((candidate) => candidate.role === role)) {
      roles.push({ role, responsibility, tools, skills, outputs, risks });
    }
  };
  const isWeb = /网站|网页|前端|浏览器|html|css|react|vue|vite|next|商城|电商|游戏|小游戏|web|frontend|browser|website|game/.test(text);
  const isGame = /游戏|小游戏|关卡|敌机|子弹|碰撞|分数|战机|game|level|enemy|bullet|collision/.test(text);
  const hasMotion = /动效|动画|gsap|motion|scroll|过渡|特效|animate|animation/.test(text);
  const hasBackend = /后端|接口|api|服务端|server|backend|express|fastify|数据库|db|sqlite|mysql|postgres/.test(text);
  const hasData = /数据库|数据|schema|seed|种子|商品|库存|catalog|csv|json|db|sqlite|data/.test(text);
  if (isGame) {
    add("玩法关卡工程师", `负责把玩法循环、关卡节奏、敌机/子弹/碰撞/计分等核心体验落到代码中：${objective}`, ["玩法逻辑", "关卡状态", "游戏运行 evidence"], ["implementation", "browser-verification"], [...commonWrite, "launch_project", "browser_screenshot"], ["避免只做静态页面；必须能运行或明确说明 blocker。"]);
  }
  if (isWeb) {
    add("前端界面工程师", `负责浏览器入口、页面结构、响应式布局和用户可见交互：${objective}`, ["浏览器入口", "响应式界面", "交互流程"], ["ui-ux", "browser-verification"], [...commonWrite, "launch_project", "browser_screenshot"], ["检查空白页、404、控制台错误和移动端溢出。"]);
  }
  if (hasMotion) {
    add("动效体验工程师", `负责 GSAP/动画时序、状态反馈、过渡和动效性能：${objective}`, ["动画时间线", "动效验证 evidence", "低动效模式说明"], ["gsap-core", "gsap-timeline", "gsap-performance", "ui-ux"], [...commonWrite, "launch_project", "browser_screenshot"], ["优先 transform/opacity；避免布局抖动和无意义装饰动效。"]);
  }
  if (hasBackend) {
    add("后端接口工程师", `负责服务端、API、启动脚本、端口和前后端联调：${objective}`, ["后端/API 代码", "启动命令", "接口验证 evidence"], ["implementation", "testing"], commonWrite, ["长服务必须走 launch_project；有限命令必须可退出。"]);
  }
  if (hasData) {
    add("数据建模工程师", `负责数据库/schema/seed/数据文件和可复现实例数据：${objective}`, ["schema/seed 数据", "数据验证 evidence"], ["spreadsheets", "data-validation", "implementation"], commonWrite, ["避免伪造数据完成状态；记录初始化和读取验证。"]);
  }
  if (/mcp|model context protocol/.test(text)) {
    add("MCP协议工程师", `负责 MCP mock、discover/call、错误摘要和协议验证：${objective}`, ["MCP discover/call evidence", "失败摘要"], ["mcp", "integration-testing"], [...commonWrite, "mcp_call"], ["无凭据时使用 mock 并明确标注。"]);
  }
  if (/ppt|pptx|slides?|演示|幻灯/.test(text)) {
    add("演示文稿设计师", `负责 PPTX 内容结构、版式和可打开性验证：${objective}`, ["PPTX 文件", "预览或验证 evidence"], ["presentations"], [...commonWrite, "create_pptx"], ["页数和文件可打开性必须验证。"]);
  }
  if (/docx?|word|文档|报告|markdown|pdf/.test(text)) {
    add("文档产物编辑", `负责文档/PDF/Markdown 结构、内容和格式验证：${objective}`, ["文档产物", "格式验证 evidence"], ["documents", "pdf", "writing"], [...commonWrite, "create_docx"], ["结构和可读性必须验证。"]);
  }
  if (!roles.length) {
    add("项目实现工程师", `负责实现主要本地产物并记录真实 evidence：${objective}`, ["本地产物", "验证 evidence"], skillsForContract(contract), commonWrite, ["不得用文字替代真实产物。"]);
    add("验证修复工程师", `负责运行检查、归纳失败并修复可复现问题：${objective}`, ["检查记录", "修复 evidence"], ["testing", "browser-verification"], [...commonWrite, "launch_project", "browser_screenshot", "verify_task"], ["失败必须保留第一行错误和修复建议。"]);
  }
  return roles;
}

function roleSpecForOutput(kind: string, description: string, objective: string): {
  role: string;
  responsibility: string;
  tools: string[];
  skills: string[];
  outputs: string[];
  risks: string[];
} {
  const commonRead = ["read_file", "list_files", "grep_files", "glob_files"];
  const commonWrite = [...commonRead, "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "validate_artifact"];
  if (kind === "web" || kind === "image") {
    const webText = `${description}\n${objective}`;
    const animated = /gsap|animation|animate|scroll|motion|动效|动画|特效|过渡/i.test(description);
    const game = /游戏|小游戏|关卡|战机|敌机|子弹|碰撞|game|level/i.test(webText);
    return {
      role: animated ? "动效体验工程师" : game ? "玩法前端工程师" : "前端界面工程师",
      responsibility: animated
        ? `实现浏览器可见的动画、动效时序和交互反馈：${objective}`
        : game
        ? `实现浏览器游戏界面、玩法交互和可运行入口：${objective}`
        : `实现用户可见的页面、布局和浏览器入口：${objective}`,
      tools: [...commonWrite, "launch_project", "browser_agent", "browser_screenshot"],
      skills: animated ? ["ui-ux", "gsap-core", "gsap-timeline", "gsap-performance", "browser-verification"] : ["ui-ux", "browser-verification"],
      outputs: [],
      risks: ["检查响应式布局、空白页、404 和控制台错误。", "必须附带截图、URL、launch 或 validator evidence。"],
    };
  }
  if (kind === "docx" || kind === "markdown") {
    return {
      role: "文档产物编辑",
      responsibility: `创建结构清晰、内容可验证的文档或 Markdown 产物：${objective}`,
      tools: [...commonWrite, "create_docx"],
      skills: kind === "docx" ? ["documents"] : ["writing", "artifact-review"],
      outputs: [],
      risks: ["验证文档文件存在且可打开/可解析。", "格式必须匹配目标文档类型。"],
    };
  }
  if (kind === "pptx") {
    return {
      role: "演示文稿设计师",
      responsibility: `创建演示文稿产物并验证幻灯片结构：${objective}`,
      tools: [...commonWrite, "create_pptx", "validate_artifact"],
      skills: ["presentations"],
      outputs: [],
      risks: ["验证页数和文件有效性。", "优先通过 presentation skill 路由。"],
    };
  }
  if (kind === "xlsx" || kind === "data") {
    return {
      role: "数据建模工程师",
      responsibility: `准备并验证数据、表格、CSV、schema 或分析产物：${objective}`,
      tools: commonWrite,
      skills: ["spreadsheets", "data-validation"],
      outputs: [],
      risks: ["验证 schema、行数和文件可读性。", "保留源数据完整性。"],
    };
  }
  if (kind === "pdf") {
    return {
      role: "PDF产物工程师",
      responsibility: `生成或验证 PDF 产物：${objective}`,
      tools: [...commonWrite, "validate_artifact"],
      skills: ["pdf", "artifact-review"],
      outputs: [],
      risks: ["验收前渲染或解析 PDF 页面。", "检查文字和版式完整性。"],
    };
  }
  if (kind === "mcp" || kind === "plugin" || kind === "automation") {
    return {
      role: kind === "mcp" ? "MCP协议工程师" : kind === "plugin" ? "插件集成工程师" : "自动化流程工程师",
      responsibility: `实现并验证集成、MCP、插件或自动化行为：${objective}`,
      tools: [...commonWrite, "mcp_call"],
      skills: kind === "plugin" ? ["plugin-creator", "mcp"] : ["mcp", "automation", "integration-testing"],
      outputs: [],
      risks: ["没有外部凭据时使用 mock 并明确标注。", "记录 discover/call/失败 evidence。"],
    };
  }
  if (kind === "code" || kind === "cli") {
    return {
      role: kind === "cli" ? "命令行工程师" : "后端接口工程师",
      responsibility: `实现可执行代码、CLI、脚本、测试或包配置：${objective}`,
      tools: commonWrite,
      skills: ["implementation", "testing"],
      outputs: [],
      risks: ["只使用可结束的有限命令。", "重试前先修复 Windows shell 不兼容。"],
    };
  }
  return {
    role: "项目实现工程师",
    responsibility: `完成用户请求的本地产物并提供真实 evidence：${objective}`,
    tools: commonWrite,
    skills: skillsForContract(contractFromSingleOutput(kind, description)),
    outputs: [],
    risks: ["完成状态必须基于真实文件、命令、预览、验证器或明确 blocker。"],
  };
}

function ensurePlannerAndAcceptanceReviewer(
  roles: AgentRoleState[],
  objective: string,
  contract: NormalizedTaskCompletionContract,
): AgentRoleState[] {
  const normalizedRoles = roles.map((role) => migrateRole(role));
  const middleRoles = normalizedRoles.filter((role) => !isPlannerRole(role.role) && !isAcceptanceRole(role.role));
  const fallback = buildCleanWorkflowPlan([], objective, contract).roles;
  const planner = normalizedRoles.find((role) => isPlannerRole(role.role)) ?? fallback.find((role) => isPlannerRole(role.role))!;
  const reviewer = normalizedRoles.find((role) => isAcceptanceRole(role.role)) ?? fallback.find((role) => isAcceptanceRole(role.role))!;
  return [planner, ...(middleRoles.length ? middleRoles : cleanExecutionRoles(objective, contract)), { ...reviewer, role: "AcceptanceReviewer", name: "AcceptanceReviewer" }];
}

function normalizeGeneratedSkills(
  generatedSkills: GeneratedRoleSkill[] | undefined,
  roles: AgentRoleState[],
  contract: NormalizedTaskCompletionContract,
): GeneratedRoleSkill[] {
  const now = Date.now();
  const existing = new Map((generatedSkills ?? []).map((skill) => [safeRoleName(skill.role), skill]));
  return roles.map((role) => {
    const found = existing.get(safeRoleName(role.role));
    if (found) {
      return {
        ...found,
        id: found.id || `skill_${safeRoleName(role.role)}`,
        role: safeRoleName(found.role || role.role),
        title: found.title || `${role.role} 工作流本地 skill`,
        summary: found.summary || compact(role.responsibility, 260),
        prompt: found.prompt || [
          `角色：${role.role}`,
          `任务：${role.responsibility}`,
          `允许工具：${role.allowedTools.join(", ") || "运行时限定工具"}`,
          `交接格式：${role.handoffFormat || "中文摘要、evidence、阻塞、下一步交接"}`,
        ].join("\n"),
        allowedTools: unique(found.allowedTools?.length ? found.allowedTools : role.allowedTools),
        outputFormat: found.outputFormat || "简洁 checkpoint：产物、命令、evidence、阻塞和下一步交接。",
        riskChecks: unique(found.riskChecks?.length ? found.riskChecks : role.riskChecks),
        handoffFormat: found.handoffFormat || role.handoffFormat || "中文摘要、evidence、阻塞、下一步交接",
        createdAtMs: found.createdAtMs || now,
      };
    }
    const outputHints = role.requiredOutputs.length
      ? role.requiredOutputs.join(" | ")
      : contract.expectedOutputs.map((output) => `${output.kind}:${output.description}`).join(" | ");
    return {
      id: `skill_${safeRoleName(role.role)}`,
      role: role.role,
      title: `${role.role} 工作流本地 skill`,
      summary: compact(`${role.responsibility} 输出：${outputHints || "分配的子任务"}`, 260),
      prompt: [
        `角色：${role.role}`,
        `任务：${role.responsibility}`,
        `上下文边界：${role.contextScope}`,
        `允许工具：${role.allowedTools.join(", ") || "运行时限定工具"}`,
        `必需输出：${outputHints || "分配的子任务"}`,
        `质量标准：${role.acceptance.join(" | ") || contract.acceptanceCriteria.join(" | ") || "必须用真实 evidence 满足用户请求"}`,
        `风险检查：${role.riskChecks.join(" | ") || "没有真实 evidence 不得声明完成"}`,
        `交接格式：${role.handoffFormat || "中文摘要、文件/产物、evidence、阻塞、下一步"}`,
      ].join("\n"),
      allowedTools: role.allowedTools,
      outputFormat: "简洁 checkpoint：产物、命令、evidence、阻塞和下一步交接。",
      riskChecks: role.riskChecks,
      handoffFormat: role.handoffFormat || "中文摘要、evidence、阻塞、下一步交接",
      createdAtMs: now,
    };
  });
}

function attachGeneratedSkillsToRoles(roles: AgentRoleState[], skills: GeneratedRoleSkill[]): AgentRoleState[] {
  const skillByRole = new Map(skills.map((skill) => [safeRoleName(skill.role), skill]));
  return roles.map((role) => {
    const normalizedRole = migrateRole(role);
    const skill = skillByRole.get(safeRoleName(normalizedRole.role));
    return skill
      ? {
        ...normalizedRole,
        generatedSkillId: skill.id,
        preloadedSkills: unique([...normalizedRole.preloadedSkills, skill.id]),
        skills: unique([...normalizedRole.skills, skill.id]),
      }
      : normalizedRole;
  });
}

function buildHeuristicSubtasks(
  objective: string,
  contract: NormalizedTaskCompletionContract,
  roles: AgentRoleState[],
): WorkflowSubtaskState[] {
  const now = Date.now();
  const outputs = contract.expectedOutputs.length
    ? contract.expectedOutputs
    : [{ kind: "unknown", description: objective, required: true }];
  if (outputs.length === 1 && outputs[0]?.kind === "unknown") {
    const executionRoles = roles.filter((role) => !isPlannerRole(role.role) && !isAcceptanceRole(role.role));
    return executionRoles
      .slice(0, roleLimitForContract(contract, objective))
      .map((role, index) => ({
        id: `subtask_${index + 1}_${safeRoleName(role.role).toLowerCase()}`,
        title: role.assignedTasks[0] || `${role.role} 子任务`,
        description: role.responsibility,
        assigneeRole: role.role,
        dependencies: index === 0 ? [] : [`subtask_${index}_${safeRoleName(executionRoles[index - 1]?.role ?? "").toLowerCase()}`].filter(Boolean),
        status: "queued",
        acceptanceCriteria: role.acceptance.length ? role.acceptance : contract.acceptanceCriteria,
        expectedOutputs: role.requiredOutputs.length ? role.requiredOutputs : ["本地产物与验证 evidence"],
        evidence: [],
        createdBy: "Planner",
        updatedAtMs: now,
      }));
  }
  return outputs.map((output, index) => {
    const assignee = assigneeForOutput(output.kind, output.description, roles);
    return {
      id: `subtask_${index + 1}_${safeRoleName(assignee).toLowerCase()}`,
      title: `${output.required ? "必需" : "可选"} ${output.kind} 产物：${compact(output.description, 90)}`,
      description: output.description,
      assigneeRole: assignee,
      dependencies: [],
      status: "queued",
      acceptanceCriteria: contract.acceptanceCriteria.length
        ? contract.acceptanceCriteria
        : [`${output.kind} output exists or a concrete blocker is recorded.`],
      expectedOutputs: [`${output.kind}: ${output.description}`],
      evidence: [],
      createdBy: "Planner",
      updatedAtMs: now,
    };
  });
}

function normalizeSubtaskGraph(
  subtasks: WorkflowSubtaskState[],
  roles: AgentRoleState[],
  contract: NormalizedTaskCompletionContract,
  now: number,
): WorkflowSubtaskState[] {
  const roleNames = roles.map((role) => role.role);
  const fallbackRole = roleNames.find((role) => !isPlannerRole(role) && !isAcceptanceRole(role)) ?? roleNames[0] ?? "ImplementationSpecialist";
  const seen = new Set<string>();
  return subtasks.map((subtask, index) => {
    let id = safeSubtaskId(subtask.id || `subtask_${index + 1}`);
    while (seen.has(id)) id = `${id}_${index + 1}`;
    seen.add(id);
    const assigneeRole = roleNames.find((role) => sameRole(role, subtask.assigneeRole)) ?? fallbackRole;
    return {
      id,
      title: subtask.title?.trim() || `Subtask ${index + 1}`,
      description: subtask.description?.trim() || subtask.title?.trim() || `Subtask ${index + 1}`,
      assigneeRole,
      parentId: subtask.parentId ? safeSubtaskId(subtask.parentId) : undefined,
      dependencies: unique((subtask.dependencies ?? []).map((dependency) => safeSubtaskId(dependency))).filter((dependency) => dependency !== id),
      status: normalizeSubtaskStatus(subtask.status),
      acceptanceCriteria: unique(subtask.acceptanceCriteria?.length ? subtask.acceptanceCriteria : contract.acceptanceCriteria),
      expectedOutputs: unique(subtask.expectedOutputs ?? []),
      evidence: unique(subtask.evidence ?? []),
      blockedBy: subtask.blockedBy,
      repairHint: subtask.repairHint,
      createdBy: subtask.createdBy || "Planner",
      taskId: subtask.taskId,
      updatedAtMs: subtask.updatedAtMs || now,
      startedAtMs: subtask.startedAtMs,
      completedAtMs: subtask.completedAtMs,
      lastEvent: subtask.lastEvent,
    };
  });
}

function defaultVerificationPlan(contract: NormalizedTaskCompletionContract): string[] {
  const plan = contract.verificationHints.length
    ? [...contract.verificationHints]
    : ["Run verify_task against the task contract before final acceptance."];
  for (const output of contract.expectedOutputs) {
    plan.push(`Verify ${output.kind}: ${output.description}`);
  }
  return unique(plan);
}

function normalizeSubtaskStatus(status: WorkflowSubtaskStatus | undefined): WorkflowSubtaskStatus {
  return ["queued", "running", "needs_review", "succeeded", "failed", "blocked", "skipped"].includes(status ?? "")
    ? status as WorkflowSubtaskStatus
    : "queued";
}

function defaultRiskAndPermissionNotes(contract: NormalizedTaskCompletionContract): string[] {
  const notes = ["Execution waits for user approval unless autoApprove=true."];
  const kinds = new Set(contract.expectedOutputs.map((output) => output.kind));
  if (["web", "code", "cli", "mcp", "plugin", "automation"].some((kind) => kinds.has(kind))) {
    notes.push("Shell, browser, MCP, or long-service actions may require explicit permissions.");
  }
  if (contract.userConstraints.length) notes.push(`User constraints: ${contract.userConstraints.join(" | ")}`);
  return notes;
}

function normalizeRoles(
  roles: AgentRoleSpec[] | undefined,
  objective: string,
  contract: NormalizedTaskCompletionContract,
): AgentRoleState[] {
  if (roles?.length) {
    return roles.map((role) => roleState({
      role: safeRoleName(role.role ?? role.name ?? "agent"),
      responsibility: role.responsibility.trim(),
      contextScope: role.contextScope ?? "Role-local context: use project state, assigned task, previous role summaries, and this role's tool history.",
      allowedTools: unique([...(role.allowedTools ?? []), ...(role.tools ?? [])]),
      preloadedSkills: unique([...(role.preloadedSkills ?? []), ...(role.skills ?? [])]),
      assignedTasks: unique(role.assignedTasks?.length ? role.assignedTasks : [role.responsibility]),
      acceptance: unique([...(role.acceptance ?? []), ...(role.acceptanceCriteria ?? [])]),
      checkpoint: role.checkpoint ?? "",
    }));
  }
  return defaultRolesForContract(objective, contract);
}

function defaultRolesForContract(objective: string, contract: NormalizedTaskCompletionContract): AgentRoleState[] {
  const complexity = taskComplexity(objective, contract);
  if (complexity === "simple") {
    return [
      roleState({
        role: "Coordinator",
        responsibility: `Clarify the requested outcome, keep scope tight, and coordinate the local work for: ${objective}`,
        contextScope: "Read the task contract, current project map, and latest run state; keep only coordination facts in checkpoint.",
        allowedTools: ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills", "send_agent_message", "agent_status"],
        preloadedSkills: ["project-planning"],
        assignedTasks: ["Confirm deliverables and route the work to Worker/Reviewer."],
        acceptance: ["Deliverables and verification approach are clear before final acceptance."],
      }),
      roleState({
        role: "Worker",
        responsibility: `Implement the concrete local changes or artifacts required for: ${objective}`,
        contextScope: "Use project files, tool feedback, selected skills, and Coordinator notes; summarize implementation output only.",
        allowedTools: ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "mcp_call", "validate_artifact"],
        preloadedSkills: skillsForContract(contract),
        assignedTasks: contract.expectedOutputs.length
          ? contract.expectedOutputs.map((output) => `Produce ${output.kind}: ${output.description}`)
          : [`Produce the requested output for: ${objective}`],
        acceptance: ["Requested output exists or a precise blocker is recorded."],
      }),
    ];
  }
  if (complexity === "medium") {
    return [
      roleState({
        role: "Planner",
        responsibility: `Break down the task, identify deliverables, and keep the role workflow aligned with: ${objective}`,
        contextScope: "Use objective, task contract, repo map, and runtime_run_state; do not retain full file dumps.",
        allowedTools: ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills", "send_agent_message", "agent_status"],
        preloadedSkills: ["project-planning"],
        assignedTasks: ["Create a concrete execution plan and hand off scoped implementation tasks."],
        acceptance: ["Plan covers required outputs, constraints, and verification hints."],
      }),
      roleState({
        role: "Builder",
        responsibility: `Implement the requested project work and artifacts for: ${objective}`,
        contextScope: "Use relevant files, Planner summary, selected skills, and tool feedback; keep a concise implementation checkpoint.",
        allowedTools: ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "mcp_call", "validate_artifact"],
        preloadedSkills: skillsForContract(contract),
        assignedTasks: implementationTasksForContract(objective, contract),
        acceptance: ["Implementation follows project structure and produces required outputs."],
      }),
      roleState({
        role: "Tester",
        responsibility: `Run relevant checks and collect actionable failures for: ${objective}`,
        contextScope: "Use build/test/launch/validation outputs and summarize only commands, failures, and fixes needed.",
        allowedTools: ["run_command", "verify_task", "verify_project", "launch_project", "validate_artifact", "browser_agent", "browser_screenshot", "read_file", "grep_files"],
        preloadedSkills: ["testing", "browser-verification"],
        assignedTasks: ["Run generic verification, startup, artifact, or behavior checks required by the contract."],
        acceptance: ["Failures include command/path/evidence; passing checks reference real runtime output."],
      }),
    ];
  }
  return [
    roleState({
      role: "Planner",
      responsibility: `Split the complex local task into role-owned work and acceptance gates for: ${objective}`,
      contextScope: "Use objective, task contract, repo map, prior checkpoints, and constraints; store only handoff summaries.",
      allowedTools: ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills", "send_agent_message", "agent_status"],
      preloadedSkills: ["project-planning"],
      assignedTasks: ["Map required outputs to specialized roles and define validation order."],
      acceptance: ["Role handoffs are explicit and verification paths are identified."],
    }),
    roleState({
      role: "Frontend",
      responsibility: "Handle user-facing, browser-viewable, visual, document-facing, or interaction work when applicable.",
      contextScope: "Use only UI/document/artifact-relevant files and summaries from Planner/Backend/DataOrIntegration.",
      allowedTools: ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "validate_artifact", "browser_screenshot"],
      preloadedSkills: skillsForContract(contract).filter((skill) => /gsap|ui|document|presentation|pdf|spreadsheet|image|browser/i.test(skill)),
      assignedTasks: ["Produce or refine user-facing artifacts and previews required by the contract."],
      acceptance: ["Visible/openable artifacts render or validate without obvious blank or malformed output."],
    }),
    roleState({
      role: "Backend",
      responsibility: "Handle runtime code, CLI behavior, scripts, APIs, persistence, and package wiring when applicable.",
      contextScope: "Use source, package manifests, command output, and tool feedback; avoid unrelated refactors.",
      allowedTools: ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "mcp_call", "validate_artifact"],
      preloadedSkills: skillsForContract(contract).filter((skill) => /code|mcp|plugin|automation|implementation/i.test(skill)),
      assignedTasks: ["Implement executable code, CLI behavior, integrations, or package wiring required by the contract."],
      acceptance: ["Finite commands, scripts, or package checks pass or report repairable failures."],
    }),
    roleState({
      role: "DataOrIntegration",
      responsibility: "Handle data files, MCP/plugin/automation wiring, external interfaces, and non-UI artifact integration.",
      contextScope: "Use schemas, data artifacts, MCP/skill summaries, and integration logs; store concise evidence.",
      allowedTools: ["read_file", "list_files", "grep_files", "glob_files", "write_file", "append_file", "apply_patch", "run_command", "invoke_skill", "mcp_call", "validate_artifact"],
      preloadedSkills: skillsForContract(contract),
      assignedTasks: ["Prepare data/integration artifacts and verify configured interfaces when applicable."],
      acceptance: ["Data, MCP, plugin, automation, or integration outputs have concrete local evidence."],
    }),
    roleState({
      role: "Tester",
      responsibility: `Run full generic checks, launch smoke tests, and failure triage for: ${objective}`,
      contextScope: "Use role checkpoints, produced artifacts, command logs, browser snapshots, and validation reports.",
      allowedTools: ["run_command", "verify_task", "verify_project", "launch_project", "validate_artifact", "browser_agent", "browser_screenshot", "read_file", "grep_files"],
      preloadedSkills: ["testing", "browser-verification"],
      assignedTasks: ["Run contract-level verification and record pass/fail evidence."],
      acceptance: ["Verification uses real artifacts, commands, launch probes, or validators."],
    }),
  ];
}

function ensureTesterRole(roles: AgentRoleState[], objective: string, contract: NormalizedTaskCompletionContract): AgentRoleState[] {
  const hasTester = roles.some((role) => /test|tester|验证|测试|qa/i.test(role.role));
  if (hasTester) return roles;
  return [
    ...roles,
    roleState({
      role: "Tester",
      responsibility: `Run relevant checks, collect failures, and feed actionable results back for: ${objective}`,
      contextScope: "Use contract, artifacts, commands, launch output, and previous role checkpoints.",
      allowedTools: ["run_command", "verify_task", "verify_project", "launch_project", "validate_artifact", "browser_agent", "browser_screenshot", "read_file", "grep_files"],
      preloadedSkills: ["testing", ...skillsForContract(contract).filter((skill) => /browser|pdf|document|presentation|spreadsheet/i.test(skill))],
      assignedTasks: ["Verify required outputs and behaviors before reviewer acceptance."],
      acceptance: ["Failures and passing checks are grounded in real tool output."],
    }),
  ];
}

function ensureAcceptanceReviewerRole(roles: AgentRoleState[], acceptanceCriteria: string[]): AgentRoleState[] {
  const hasReviewer = roles.some((role) => /review|reviewer|验收|审查|acceptance/i.test(role.role));
  if (hasReviewer) return roles;
  return [
    ...roles,
    roleState({
      role: "Reviewer",
      responsibility: "Verify the final result against the task contract, confirm requested artifacts or behaviors exist, check obvious failures, and summarize remaining issues.",
      contextScope: "Read only role checkpoints, validation summaries, artifacts, and the task contract unless a specific failure needs source inspection.",
      allowedTools: ["read_file", "list_files", "glob_files", "grep_files", "validate_artifact", "verify_task", "verify_project", "launch_project", "browser_screenshot", "agent_status", "finish_agent_workflow"],
      preloadedSkills: ["acceptance-review", "artifact-review", "runtime-verification"],
      assignedTasks: ["Perform final acceptance and finish the workflow only after evidence is sufficient."],
      acceptance: acceptanceCriteria.length
        ? acceptanceCriteria
        : [
          "Required outputs or behaviors exist.",
          "verify_task has checked non-chat deliverables.",
          "The result matches the user request.",
          "Known limitations are reported honestly.",
        ],
    }),
  ];
}

function roleState(input: {
  role: string;
  responsibility: string;
  contextScope?: string;
  allowedTools?: string[];
  preloadedSkills?: string[];
  assignedTasks?: string[];
  acceptance?: string[];
  requiredOutputs?: string[];
  riskChecks?: string[];
  handoffFormat?: string;
  generatedSkillId?: string;
  checkpoint?: string;
}): AgentRoleState {
  const role = safeRoleName(input.role);
  return {
    name: role,
    role,
    responsibility: input.responsibility.trim(),
    contextScope: input.contextScope?.trim() || "角色本地上下文：只使用任务契约、分配任务、工具反馈和 checkpoint 摘要。",
    allowedTools: unique(input.allowedTools ?? []),
    preloadedSkills: unique(input.preloadedSkills ?? []),
    assignedTasks: unique(input.assignedTasks?.length ? input.assignedTasks : [input.responsibility]),
    completedTasks: [],
    transcript: [],
    toolResultSummary: [],
    checkpoint: input.checkpoint ?? "",
    status: "queued",
    taskIds: [],
    skills: unique(input.preloadedSkills ?? []),
    tools: unique(input.allowedTools ?? []),
    acceptance: unique(input.acceptance ?? []),
    requiredOutputs: unique(input.requiredOutputs ?? []),
    riskChecks: unique(input.riskChecks ?? []),
    handoffFormat: input.handoffFormat?.trim() || "返回中文摘要、产物/evidence、阻塞和下一步交接。",
    generatedSkillId: input.generatedSkillId,
  };
}

export function normalizeTaskCompletionContract(
  contract: TaskCompletionContract | undefined,
  fallbackObjective: string,
  fallbackAcceptance: string[] = [],
): NormalizedTaskCompletionContract {
  const expectedOutputs = [
    ...(contract?.expectedOutputs ?? []).map((output) => ({
      kind: output.kind ?? "unknown",
      description: output.description,
      required: output.required ?? true,
    })),
    ...(contract?.expected_artifacts ?? []).map((artifact) => ({
      kind: kindFromExpectedArtifact(artifact),
      description: artifact,
      required: true,
    })),
  ].filter((output) => output.description.trim());
  return {
    objective: contract?.objective ?? contract?.goal ?? fallbackObjective,
    expectedOutputs: uniqueBy(expectedOutputs, (output) => `${output.kind}:${output.description}`),
    acceptanceCriteria: unique([
      ...(contract?.acceptanceCriteria ?? []),
      ...(contract?.acceptance_criteria ?? []),
      ...fallbackAcceptance,
    ]),
    userConstraints: unique([
      ...(contract?.userConstraints ?? []),
      ...(contract?.user_constraints ?? []),
    ]),
    verificationHints: unique([
      ...(contract?.verificationHints ?? []),
      ...(contract?.verifiable_behaviors ?? []),
    ]),
  };
}

function taskComplexity(objective: string, contract: NormalizedTaskCompletionContract): "simple" | "medium" | "complex" {
  const requiredOutputs = contract.expectedOutputs.filter((output) => output.required);
  const kinds = new Set(contract.expectedOutputs.map((output) => output.kind));
  const manyKinds = kinds.size >= 3;
  const integrationKinds = ["mcp", "plugin", "automation", "data"];
  const complexKinds = [...kinds].filter((kind) => integrationKinds.includes(kind)).length >= 2;
  if (requiredOutputs.length >= 3 || manyKinds || complexKinds || objective.length > 420) return "complex";
  if (requiredOutputs.length >= 2 || contract.acceptanceCriteria.length >= 4 || objective.length > 180) return "medium";
  return "simple";
}

function implementationTasksForContract(objective: string, contract: NormalizedTaskCompletionContract): string[] {
  if (contract.expectedOutputs.length) {
    return contract.expectedOutputs.map((output) => `Implement ${output.kind}: ${output.description}`);
  }
  return [`Implement the requested local deliverable for: ${objective}`];
}

function skillsForContract(contract: NormalizedTaskCompletionContract): string[] {
  const skills = new Set<string>();
  const text = contract.expectedOutputs.map((output) => `${output.kind} ${output.description}`).join("\n").toLowerCase();
  for (const output of contract.expectedOutputs) {
    switch (output.kind) {
      case "web":
      case "image":
        skills.add("ui-ux");
        skills.add("browser-verification");
        if (/gsap|animation|animate|scroll|动效|动画|特效|过渡/i.test(output.description)) {
          skills.add("gsap-core");
          skills.add("gsap-timeline");
          skills.add("gsap-performance");
        }
        break;
      case "docx":
        skills.add("documents");
        break;
      case "pptx":
        skills.add("presentations");
        break;
      case "xlsx":
      case "data":
        skills.add("spreadsheets");
        break;
      case "pdf":
        skills.add("pdf");
        break;
      case "mcp":
        skills.add("mcp");
        break;
      case "plugin":
        skills.add("plugin-creator");
        break;
      case "automation":
        skills.add("automation");
        break;
      case "code":
      case "cli":
        skills.add("implementation");
        break;
    }
  }
  if (/gsap|animation|animate|scroll|动效|动画|特效|过渡/i.test(text)) {
    skills.add("gsap-core");
    skills.add("gsap-timeline");
    skills.add("gsap-performance");
  }
  return [...skills];
}

function updateRole(
  record: AgentWorkflowRecord,
  roleName: string,
  update: (role: AgentRoleState) => AgentRoleState,
): AgentWorkflowRecord {
  return {
    ...record,
    roles: record.roles.map((role) => sameRole(role.role, roleName) || sameRole(role.name, roleName) ? migrateRole(update(role)) : role),
    updatedAtMs: Date.now(),
  };
}

function migrateRecord(record: AgentWorkflowRecord): AgentWorkflowRecord {
  const contract = record.contract ?? normalizeTaskCompletionContract(undefined, record.objective ?? "Workflow");
  const roles = (record.roles ?? []).map((role) => migrateRole(role as AgentRoleState));
  const generatedSkills = record.generatedSkills?.length
    ? record.generatedSkills
    : normalizeGeneratedSkills(undefined, roles, contract);
  const migratedRoles = attachGeneratedSkillsToRoles(roles, generatedSkills);
  const subtaskGraph = record.subtaskGraph?.length
    ? normalizeSubtaskGraph(record.subtaskGraph, migratedRoles, contract, record.updatedAtMs ?? Date.now())
    : buildHeuristicSubtasks(record.objective ?? contract.objective, contract, migratedRoles);
  return {
    ...record,
    phase: record.phase ?? (record.status === "succeeded" ? "completed" : record.status === "failed" ? "blocked" : "executing"),
    approvalState: record.approvalState ?? {
      required: false,
      status: "not_required",
      revisionCount: 0,
    },
    rolePlan: record.rolePlan ?? {
      source: "heuristic",
      plannerNotes: "Migrated legacy workflow record.",
      roles: migratedRoles,
    },
    roles: migratedRoles,
    subtaskGraph,
    generatedSkills,
    expectedArtifacts: record.expectedArtifacts ?? contract.expectedOutputs.map((output) => `${output.kind}: ${output.description}`),
    verificationPlan: record.verificationPlan ?? defaultVerificationPlan(contract),
    riskAndPermissionNotes: record.riskAndPermissionNotes ?? defaultRiskAndPermissionNotes(contract),
    contract,
  };
}

function migrateRole(role: AgentRoleState): AgentRoleState {
  const legacy = role as AgentRoleState & Partial<AgentRoleSpec>;
  const name = safeRoleName(legacy.role ?? legacy.name ?? "agent");
  const allowedTools = unique([...(legacy.allowedTools ?? []), ...(legacy.tools ?? [])]);
  const preloadedSkills = unique([...(legacy.preloadedSkills ?? []), ...(legacy.skills ?? [])]);
  return {
    name,
    role: name,
    responsibility: legacy.responsibility ?? "Handle assigned workflow work.",
    contextScope: legacy.contextScope ?? "Role-local context: use task contract, assigned work, tool feedback, and checkpoint summaries.",
    allowedTools,
    preloadedSkills,
    assignedTasks: unique(legacy.assignedTasks?.length ? legacy.assignedTasks : [legacy.responsibility ?? "Handle assigned workflow work."]),
    completedTasks: unique(legacy.completedTasks ?? []),
    transcript: legacy.transcript ?? [],
    toolResultSummary: unique(legacy.toolResultSummary ?? []),
    checkpoint: legacy.checkpoint ?? "",
    status: legacy.status ?? "queued",
    lastMessage: legacy.lastMessage,
    blockedBy: legacy.blockedBy,
    taskIds: unique(legacy.taskIds ?? []),
    skills: preloadedSkills,
    tools: allowedTools,
    acceptance: unique([...(legacy.acceptance ?? []), ...(legacy.acceptanceCriteria ?? [])]),
    requiredOutputs: unique(legacy.requiredOutputs ?? []),
    riskChecks: unique(legacy.riskChecks ?? []),
    handoffFormat: legacy.handoffFormat ?? "Return summary, artifacts/evidence, blockers, and next handoff.",
    generatedSkillId: legacy.generatedSkillId,
  };
}

function roleSummary(role: AgentRoleState): Record<string, unknown> {
  return {
    role: role.role,
    responsibility: role.responsibility,
    contextScope: role.contextScope,
    allowedTools: role.allowedTools,
    preloadedSkills: role.preloadedSkills,
    assignedTasks: role.assignedTasks,
    requiredOutputs: role.requiredOutputs,
    riskChecks: role.riskChecks,
    handoffFormat: role.handoffFormat,
    generatedSkillId: role.generatedSkillId,
    acceptance: role.acceptance,
    status: role.status,
  };
}

function safeRoleName(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5-]/g, "").slice(0, 48) || "agent";
}

function sameRole(left: string, right: string): boolean {
  return safeRoleName(left).toLowerCase() === safeRoleName(right).toLowerCase();
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(value);
  }
  return out;
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function defaultMaxSteps(roleCount: number): number {
  return Math.min(50, Math.max(8, roleCount * 3));
}

function kindFromExpectedArtifact(value: string): string {
  const lower = value.toLowerCase();
  if (/\.(html?|jsx|tsx|vue|svelte)$/.test(lower)) return "web";
  if (/\.(docx)$/.test(lower)) return "docx";
  if (/\.(pptx)$/.test(lower)) return "pptx";
  if (/\.(xlsx|xls|csv|tsv|json)$/.test(lower)) return "data";
  if (/\.(pdf)$/.test(lower)) return "pdf";
  if (/\.(md|markdown)$/.test(lower)) return "markdown";
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return "image";
  if (/\.(js|ts|mjs|cjs|py|ps1|bat|cmd|sh)$/.test(lower)) return "code";
  return "unknown";
}

function roleKeyForOutput(kind: string, description: string): string {
  if ((kind === "web" || kind === "image") && /gsap|animation|animate|scroll|motion|动效|动画|特效|过渡|关卡|游戏/i.test(description)) return "motion-web";
  if (kind === "web" || kind === "image") return "visual-web";
  if (kind === "docx" || kind === "markdown") return "document";
  if (kind === "pptx") return "deck";
  if (kind === "xlsx" || kind === "data") return "data";
  if (kind === "pdf") return "pdf";
  if (kind === "mcp" || kind === "plugin" || kind === "automation") return "integration";
  if (kind === "code" || kind === "cli") return "runtime";
  return "implementation";
}

function roleLimitForContract(contract: NormalizedTaskCompletionContract, objective = ""): number {
  const required = contract.expectedOutputs.filter((output) => output.required).length;
  const text = `${objective}\n${contract.expectedOutputs.map((output) => output.description).join("\n")}`.toLowerCase();
  if (/游戏|小游戏|网站|商城|前后端|后端|数据库|api|动效|动画|全栈|game|website|full.?stack|backend|database|animation/.test(text)) {
    if (required <= 1) return 4;
    if (required <= 3) return 5;
  }
  if (required <= 1) return 2;
  if (required <= 3) return 4;
  return 7;
}

function contractFromSingleOutput(kind: string, description: string): NormalizedTaskCompletionContract {
  return {
    objective: description,
    expectedOutputs: [{ kind, description, required: true }],
    acceptanceCriteria: [],
    userConstraints: [],
    verificationHints: [],
  };
}

function assigneeForOutput(kind: string, description: string, roles: AgentRoleState[]): string {
  const key = roleKeyForOutput(kind, description);
  const executionRoles = roles.filter((role) => !isPlannerRole(role.role) && !isAcceptanceRole(role.role));
  const scored = executionRoles.map((role) => {
    const roleName = role.role.toLowerCase();
    const outputText = role.requiredOutputs.join(" ").toLowerCase();
    const skillText = role.preloadedSkills.join(" ").toLowerCase();
    const text = [roleName, outputText, skillText].join(" ");
    let score = 0;
    if (key === "motion-web") {
      if (/动效|动画|motion|animation|gsap|特效|过渡/.test(roleName)) score += 40;
      if (/动效|动画|motion|animation|gsap|特效|过渡/.test(outputText + " " + skillText)) score += 16;
      if (/玩法|关卡|游戏|前端|界面|体验|web|ui/.test(text)) score += 4;
      if (/后端|接口|数据|数据库/.test(roleName)) score -= 16;
    } else if (key === "visual-web") {
      if (/前端|界面|页面|玩法|游戏|web|ui|visual/.test(roleName)) score += 40;
      if (/浏览器|页面|入口|交互|响应式|web|ui|visual/.test(outputText + " " + skillText)) score += 14;
      if (/动效|动画/.test(roleName)) score -= 10;
      if (/后端|接口|数据|数据库/.test(roleName)) score -= 16;
    } else if (key === "runtime") {
      if (/后端|接口|服务端|api|runtime|cli|script|命令行|脚本|代码|code/.test(roleName)) score += 40;
      if (/后端|接口|服务端|api|runtime|cli|script|命令行|脚本|代码|code/.test(outputText + " " + skillText)) score += 14;
      if (/数据|建模/.test(roleName)) score -= 6;
      if (/前端|界面|动效|动画|玩法/.test(roleName)) score -= 18;
    } else if (key === "data") {
      if (/数据|建模|表格|data|spreadsheet/.test(roleName)) score += 42;
      if (/数据|数据库|schema|seed|种子|表格|csv|spreadsheet|data|建模/.test(outputText + " " + skillText)) score += 14;
      if (/后端|接口/.test(roleName)) score -= 8;
      if (/前端|界面|动效|动画|玩法/.test(roleName)) score -= 18;
    } else if (key === "document") {
      if (/document|writer|markdown|doc|文档|编辑/.test(text)) score += 24;
    } else if (key === "deck") {
      if (/deck|presentation|slide|演示|文稿|幻灯/.test(text)) score += 24;
    } else if (key === "pdf") {
      if (/pdf/.test(text)) score += 24;
    } else if (key === "integration") {
      if (/integration|protocol|mcp|plugin|automation|协议|插件|自动化|集成/.test(text)) score += 24;
    } else if (/implementation|specialist|builder|实现|工程师/.test(text)) {
      score += 1;
    }
    return { role, score };
  }).sort((a, b) => b.score - a.score);
  return scored.find((item) => item.score > 0)?.role.role ?? executionRoles[0]?.role ?? "项目实现工程师";
}

function safeSubtaskId(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, "_").replace(/[^\w.-]/g, "").slice(0, 64);
  return cleaned || `subtask_${randomUUID().slice(0, 8)}`;
}

function isPlannerRole(role: string): boolean {
  return sameRole(role, "Planner") || /planner|规划|计划/i.test(role);
}

function isAcceptanceRole(role: string): boolean {
  return sameRole(role, "AcceptanceReviewer") || /acceptance|reviewer|review|验收|审查/i.test(role);
}

function selectNextSubtask(
  record: AgentWorkflowRecord,
  roleName?: string,
  subtaskId?: string,
): WorkflowSubtaskState | undefined {
  const candidates = subtaskId
    ? record.subtaskGraph.filter((subtask) => subtask.id === subtaskId || subtask.taskId === subtaskId)
    : record.subtaskGraph;
  const roleMatches = (subtask: WorkflowSubtaskState): boolean => {
    if (!roleName) return true;
    if (subtask.status === "needs_review") return isAcceptanceRole(roleName);
    return sameRole(subtask.assigneeRole, roleName);
  };
  const runnable = candidates
    .filter((subtask) => roleMatches(subtask))
    .filter((subtask) => !["succeeded", "skipped", "running"].includes(subtask.status))
    .filter((subtask) => dependenciesSatisfied(record, subtask));
  const priority: WorkflowSubtaskStatus[] = ["needs_review", "queued", "blocked", "failed"];
  for (const status of priority) {
    const found = runnable.find((subtask) => subtask.status === status);
    if (found) return found;
  }
  return undefined;
}

function dependenciesSatisfied(record: AgentWorkflowRecord, subtask: WorkflowSubtaskState): boolean {
  return subtask.dependencies.every((dependency) => {
    const found = record.subtaskGraph.find((candidate) => candidate.id === dependency);
    return !found || found.status === "succeeded" || found.status === "skipped";
  });
}

function updateSubtask(
  record: AgentWorkflowRecord,
  subtaskId: string,
  update: (subtask: WorkflowSubtaskState) => WorkflowSubtaskState,
): AgentWorkflowRecord {
  return {
    ...record,
    subtaskGraph: record.subtaskGraph.map((subtask) => subtask.id === subtaskId ? update(subtask) : subtask),
    updatedAtMs: Date.now(),
  };
}

function nextSubtaskStatusForRole(
  record: AgentWorkflowRecord,
  subtask: WorkflowSubtaskState,
  roleName: string,
  roleStatus: WorkflowRoleStatus,
  report: ActionExecutionReport,
): WorkflowSubtaskStatus {
  if (roleStatus === "failed") return "failed";
  if (roleStatus === "blocked") return "blocked";
  if (roleStatus === "running") return "running";
  if (report.status !== "succeeded") return "blocked";
  if (isAcceptanceRole(roleName) || isAcceptanceRole(subtask.assigneeRole)) return "succeeded";
  if (record.phase === "reviewing") return "needs_review";
  return "needs_review";
}

function roleStatusAfterSubtask(
  record: AgentWorkflowRecord,
  role: AgentRoleState,
  stepStatus: WorkflowRoleStatus,
): WorkflowRoleStatus {
  if (stepStatus === "failed" || stepStatus === "blocked" || stepStatus === "running") return stepStatus;
  const assigned = record.subtaskGraph.filter((subtask) =>
    sameRole(subtask.assigneeRole, role.role) ||
    (isAcceptanceRole(role.role) && subtask.status === "needs_review")
  );
  if (!assigned.length) return role.status === "succeeded" ? "succeeded" : "idle";
  if (assigned.some((subtask) => ["queued", "running", "needs_review", "blocked", "failed"].includes(subtask.status))) return "idle";
  return "succeeded";
}

function taskStatusForSubtask(subtaskStatus: WorkflowSubtaskStatus | undefined, roleStatus: WorkflowRoleStatus): TaskRecord["status"] {
  if (subtaskStatus === "succeeded") return "succeeded";
  if (subtaskStatus === "failed") return "failed";
  if (subtaskStatus === "skipped") return "cancelled";
  if (subtaskStatus === "running" || roleStatus === "running") return "running";
  if (subtaskStatus === "blocked" || subtaskStatus === "needs_review" || roleStatus === "blocked") return "paused";
  return roleStatus === "failed" ? "failed" : "queued";
}

function countSubtasks(subtasks: WorkflowSubtaskState[]): Record<WorkflowSubtaskStatus | "total", number> {
  const counts: Record<WorkflowSubtaskStatus | "total", number> = {
    total: subtasks.length,
    queued: 0,
    running: 0,
    needs_review: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  };
  for (const subtask of subtasks) counts[subtask.status] += 1;
  return counts;
}
