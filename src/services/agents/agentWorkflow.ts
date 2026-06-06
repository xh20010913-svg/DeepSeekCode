import { randomUUID } from "node:crypto";
import path from "node:path";
import type { StateStore, TaskRecord } from "../../state/sqlite.js";

export interface AgentRoleSpec {
  name: string;
  responsibility: string;
  skills: string[];
  tools: string[];
  acceptance: string[];
}

export interface AgentWorkflowRecord {
  id: string;
  runId: string;
  objective: string;
  roles: AgentRoleSpec[];
  acceptanceCriteria: string[];
  maxSteps: number;
  status: "running" | "succeeded" | "failed" | "needs_followup";
  createdAtMs: number;
  updatedAtMs: number;
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
    acceptanceCriteria?: string[];
    maxSteps?: number;
  }): AgentWorkflowRecord {
    const now = Date.now();
    const id = `workflow_${randomUUID()}`;
    const roles = ensureAcceptanceReviewerRole(normalizeRoles(input.roles, input.objective), input.acceptanceCriteria ?? []);
    const record: AgentWorkflowRecord = {
      id,
      runId: input.runId,
      objective: input.objective,
      roles,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      maxSteps: Math.min(50, Math.max(1, Math.trunc(input.maxSteps ?? 12))),
      status: "running",
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.save(record);
    this.setActiveWorkflowId(id);
    this.state.saveCheckpoint(input.runId, `agent_workflow:${id}:roles`, record);
    this.state.appendEvent(input.runId, "agent_workflow_started", {
      workflow_id: id,
      objective: input.objective,
      role_count: roles.length,
      roles: roles.map((role) => role.name),
    });
    for (const role of roles) {
      const taskId = this.state.createTask({
        runId: input.runId,
        agent: role.name,
        title: role.responsibility,
        detail: [
          `workflow=${id}`,
          role.skills.length ? `skills=${role.skills.join(",")}` : "",
          role.tools.length ? `tools=${role.tools.join(",")}` : "",
        ].filter(Boolean).join(" "),
      });
      this.state.appendEvent(input.runId, "agent_workflow_role_task_created", {
        workflow_id: id,
        task_id: taskId,
        role,
      });
    }
    this.addMessage(id, {
      from: "supervisor",
      to: "all",
      message: `Workflow started: ${input.objective}`,
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
    this.state.appendEvent(input.runId, "agent_workflow_message", {
      workflow_id: record.id,
      ...entry,
    });
    return record;
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
      status: input.status,
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
    const counts = {
      total: tasks.length,
      done: tasks.filter((task) => task.status === "succeeded").length,
      running: tasks.filter((task) => task.status === "running").length,
      pending: tasks.filter((task) => task.status === "queued" || task.status === "paused").length,
      failed: tasks.filter((task) => task.status === "failed").length,
    };
    return [
      "DeepSeekCode agent workflow",
      `status: ${record.status}`,
      `objective: ${record.objective}`,
      `progress: ${counts.done}/${counts.total} done, running=${counts.running}, pending=${counts.pending}, failed=${counts.failed}`,
      "",
      "roles:",
      ...record.roles.map((role) => {
        const task = taskByAgent.get(role.name);
        return [
          `- ${role.name} [${task?.status ?? "defined"}]: ${role.responsibility}`,
          role.skills.length ? `  skills: ${role.skills.join(", ")}` : "",
          role.tools.length ? `  tools: ${role.tools.join(", ")}` : "",
          role.acceptance.length ? `  acceptance: ${role.acceptance.join(" | ")}` : "",
        ].filter(Boolean).join("\n");
      }),
      record.acceptanceCriteria.length ? `\nworkflow acceptance: ${record.acceptanceCriteria.join(" | ")}` : "",
      messages.length ? `latest message: ${messages.at(-1)?.from} -> ${messages.at(-1)?.to}: ${messages.at(-1)?.message}` : "",
      "next: Reviewer must verify artifacts, startup, visible output, and reported failures before finish_agent_workflow.",
    ].filter(Boolean).join("\n");
  }

  private resolve(workflowId?: string): AgentWorkflowRecord {
    const id = workflowId?.trim() || this.activeWorkflowId();
    if (!id) throw new Error("No active agent workflow. Call start_agent_workflow first.");
    const record = this.state.getUiState<AgentWorkflowRecord>(this.scope, id);
    if (!record) throw new Error(`agent workflow not found: ${id}`);
    return record;
  }

  private save(record: AgentWorkflowRecord): void {
    this.state.setUiState(this.scope, record.id, record);
  }

  private activeWorkflowId(): string | undefined {
    return this.state.getUiState<string>(this.scope, "active");
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
}

function normalizeRoles(roles: AgentRoleSpec[] | undefined, objective: string): AgentRoleSpec[] {
  if (roles?.length) {
    return roles.map((role) => ({
      name: safeRoleName(role.name),
      responsibility: role.responsibility.trim(),
      skills: unique(role.skills),
      tools: unique(role.tools),
      acceptance: unique(role.acceptance),
    }));
  }
  return [
    {
      name: "Planner",
      responsibility: `Clarify the work plan, break down tasks, and keep the workflow aligned with the objective: ${objective}`,
      skills: ["project-planning"],
      tools: ["TodoWrite", "read_file", "list_files", "grep_files", "search_skills"],
      acceptance: [
        "Task plan is clear and actionable.",
        "Deliverables and acceptance checks are explicit before implementation.",
      ],
    },
    {
      name: "Builder",
      responsibility: `Implement the concrete project work required by the objective: ${objective}`,
      skills: ["implementation", "ui-ux", "documents", "presentations", "spreadsheets", "pdf"],
      tools: ["read_file", "write_file", "append_file", "apply_patch", "invoke_skill", "mcp_call", "run_command"],
      acceptance: [
        "Requested artifacts or code changes exist in the project.",
        "Implementation follows the project structure instead of dumping unrelated files.",
      ],
    },
    {
      name: "Tester",
      responsibility: `Run relevant checks for the objective, collect failures, and feed actionable results back to Builder: ${objective}`,
      skills: ["testing", "browser-verification"],
      tools: ["run_command", "verify_task", "verify_project", "launch_project", "validate_artifact", "browser_agent", "read_file", "grep_files"],
      acceptance: [
        "The task has been checked against the generic completion contract when applicable.",
        "Build/test/start, script execution, document/data validation, or artifact verification has been attempted when applicable.",
        "Failures are summarized with commands, paths, and likely causes.",
      ],
    },
  ];
}

function ensureAcceptanceReviewerRole(roles: AgentRoleSpec[], acceptanceCriteria: string[]): AgentRoleSpec[] {
  const hasReviewer = roles.some((role) => /review|reviewer|验收|验证|测试|qa|test/i.test(role.name));
  if (hasReviewer) return roles;
  return [
    ...roles,
    {
      name: "Reviewer",
      responsibility: "Verify the final result against the task contract, confirm requested artifacts or behaviors exist, check obvious failures, and summarize remaining issues.",
      skills: ["acceptance-review", "artifact-review", "runtime-verification"],
      tools: ["read_file", "list_files", "glob_files", "validate_artifact", "verify_task", "verify_project", "launch_project", "browser_screenshot"],
      acceptance: acceptanceCriteria.length
        ? acceptanceCriteria
        : [
          "Final artifacts, files, data outputs, documents, or executable behaviors required by the user exist.",
          "verify_task has been used when the task produced non-chat deliverables.",
          "Runnable projects, scripts, documents, datasets, Office/PDF files, browser artifacts, skills, plugins, and MCP outputs are validated with the relevant generic checker.",
          "Blank pages, console errors, install failures, native dependency failures, startup failures, malformed documents, invalid data, or missing outputs are reported and repaired when possible.",
          "The result matches the user request.",
          "Known limitations are reported honestly.",
        ],
    },
  ];
}

function ensureReviewerRole(roles: AgentRoleSpec[], acceptanceCriteria: string[]): AgentRoleSpec[] {
  const hasReviewer = roles.some((role) => /review|验收|qa|test|验证/i.test(role.name));
  if (hasReviewer) return roles;
  return [
    ...roles,
    {
      name: "reviewer",
      responsibility: "Verify the final result against the task contract, confirm requested artifacts or behaviors exist, check obvious failures, and summarize remaining issues.",
      skills: [],
      tools: ["read_file", "list_files", "glob_files", "validate_artifact", "verify_task", "browser_screenshot"],
      acceptance: acceptanceCriteria.length
        ? acceptanceCriteria
        : ["Required outputs or behaviors exist.", "verify_task has checked non-chat deliverables.", "The result matches the user request.", "Known limitations are reported honestly."],
    },
  ];
}

function safeRoleName(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5-]/g, "").slice(0, 48) || "agent";
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
