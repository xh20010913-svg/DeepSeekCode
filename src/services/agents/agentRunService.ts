import type { RuntimeConfig } from "../../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import type { RunRecord, StateStore, TaskRecord } from "../../state/sqlite.js";
import { DurableTaskQueue } from "../../tasks/queue.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";
import { runAgentTask, type AgentRunResult } from "./agentRunner.js";

export interface StartedAgentRun {
  runId: string;
  taskId: string;
}

export interface AgentRunStepResult {
  runId: string;
  task?: TaskRecord;
  status: "idle" | "succeeded" | "failed";
  message: string;
  result?: AgentRunResult;
}

export interface AgentRunSummary {
  run: RunRecord;
  tasks: TaskRecord[];
}

export interface AgentRunDetail extends AgentRunSummary {
  events: Array<{ kind: string; payload: unknown; createdAtMs: number }>;
}

export interface AgentRunDrainResult {
  runId: string;
  steps: AgentRunStepResult[];
  status: "idle" | "succeeded" | "failed" | "max_steps";
  message: string;
}

export class AgentRunService {
  constructor(
    private readonly state: StateStore,
    private readonly config: RuntimeConfig,
  ) {}

  start(input: { agent: string; task: string }): StartedAgentRun {
    const runId = this.state.createRun({
      projectPath: this.config.projectPath,
      model: this.config.model,
      message: `agent:${input.agent} ${input.task}`,
      status: "running",
    });
    const taskId = this.state.createTask({
      runId,
      agent: input.agent,
      title: input.task,
      detail: "queued agent task",
    });
    this.state.appendEvent(runId, "agent_run_started", {
      agent: input.agent,
      task: input.task,
      task_id: taskId,
    });
    return { runId, taskId };
  }

  addTask(input: { runId: string; agent: string; task: string; dependsOnTaskId?: string }): string {
    const run = this.state.getRun(input.runId);
    if (!run) throw new Error(`run not found: ${input.runId}`);
    if (run.status === "cancelled" || run.status === "failed") {
      throw new Error(`cannot add task to ${run.status} run: ${input.runId}`);
    }
    if (run.status === "succeeded") {
      this.state.updateRunStatus(input.runId, "running", "agent task added");
    }
    const taskId = this.state.createTask({
      runId: input.runId,
      agent: input.agent,
      title: input.task,
      detail: "queued agent task",
    });
    if (input.dependsOnTaskId) this.state.addTaskDependency(taskId, input.dependsOnTaskId);
    this.state.appendEvent(input.runId, "agent_task_added", {
      task_id: taskId,
      agent: input.agent,
      task: input.task,
      depends_on_task_id: input.dependsOnTaskId,
    });
    return taskId;
  }

  list(limit = 20): AgentRunSummary[] {
    return this.state
      .listRuns(Math.max(limit * 3, limit))
      .filter((run) => run.message.startsWith("agent:"))
      .slice(0, limit)
      .map((run) => ({
        run,
        tasks: this.state.listTasks(run.id),
      }));
  }

  detail(runId: string, eventLimit = 30): AgentRunDetail {
    const run = this.state.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    return {
      run,
      tasks: this.state.listTasks(runId),
      events: this.state.listEvents(runId, eventLimit).map((event) => ({
        kind: event.kind,
        payload: event.payload,
        createdAtMs: event.createdAtMs,
      })),
    };
  }

  async step(input: {
    runId: string;
    provider: DeepSeekProviderClient;
    permissions: RuntimePermissionState;
  }): Promise<AgentRunStepResult> {
    const run = this.state.getRun(input.runId);
    if (!run) throw new Error(`run not found: ${input.runId}`);

    const queue = new DurableTaskQueue(this.state);
    const task = queue.claimNext(input.runId, "agent-runner");
    if (!task) {
      const finalStatus = this.finalizeIfComplete(input.runId);
      return {
        runId: input.runId,
        status: "idle",
        message: finalStatus ? `run ${input.runId} is ${finalStatus}` : "no runnable agent task",
      };
    }

    try {
      const result = await runAgentTask({
        name: task.agent,
        task: task.title,
        config: this.config,
        provider: input.provider,
        permissions: input.permissions,
      });
      for (const turn of result.turns) {
        this.state.saveCheckpoint(input.runId, `agent_${task.id}_turn_${turn.index}_envelope`, turn.envelope);
        this.state.appendEvent(input.runId, "agent_turn_completed", {
          task_id: task.id,
          agent: task.agent,
          turn: turn.index,
          status: turn.execution.status,
          action_count: turn.envelope.actions.length,
        });
      }
      this.state.recordActionResults(input.runId, result.execution);
      if (result.execution.status === "succeeded") {
        queue.complete(task.id, result.execution.final_message || "agent task completed");
        this.finalizeIfComplete(input.runId);
        return {
          runId: input.runId,
          task,
          status: "succeeded",
          message: result.execution.final_message || "agent task completed",
          result,
        };
      }
      queue.fail(task.id, result.execution.final_message || "agent task failed");
      this.state.updateRunStatus(input.runId, "failed", result.execution.final_message || "agent task failed");
      return {
        runId: input.runId,
        task,
        status: "failed",
        message: result.execution.final_message || "agent task failed",
        result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      queue.fail(task.id, message);
      this.state.updateRunStatus(input.runId, "failed", message);
      this.state.appendEvent(input.runId, "agent_run_failed", {
        task_id: task.id,
        agent: task.agent,
        message,
      });
      return { runId: input.runId, task, status: "failed", message };
    }
  }

  async runNow(input: {
    agent: string;
    task: string;
    provider: DeepSeekProviderClient;
    permissions: RuntimePermissionState;
  }): Promise<StartedAgentRun & AgentRunStepResult> {
    const started = this.start({ agent: input.agent, task: input.task });
    const stepped = await this.step({
      runId: started.runId,
      provider: input.provider,
      permissions: input.permissions,
    });
    return { ...started, ...stepped };
  }

  async drain(input: {
    runId: string;
    provider: DeepSeekProviderClient;
    permissions: RuntimePermissionState;
    maxSteps?: number;
  }): Promise<AgentRunDrainResult> {
    const maxSteps = Math.min(50, Math.max(1, Math.trunc(input.maxSteps ?? 10)));
    const steps: AgentRunStepResult[] = [];
    for (let index = 0; index < maxSteps; index += 1) {
      const step = await this.step({
        runId: input.runId,
        provider: input.provider,
        permissions: input.permissions,
      });
      steps.push(step);
      if (step.status === "failed") {
        return { runId: input.runId, steps, status: "failed", message: step.message };
      }
      if (step.status === "idle") {
        const run = this.state.getRun(input.runId);
        return {
          runId: input.runId,
          steps,
          status: run?.status === "succeeded" ? "succeeded" : "idle",
          message: step.message,
        };
      }
    }
    return {
      runId: input.runId,
      steps,
      status: "max_steps",
      message: `stopped after ${maxSteps} agent steps`,
    };
  }

  private finalizeIfComplete(runId: string): "succeeded" | "failed" | undefined {
    const tasks = this.state.listTasks(runId);
    if (tasks.length === 0) return undefined;
    if (tasks.some((task) => task.status === "failed" || task.status === "cancelled")) {
      this.state.updateRunStatus(runId, "failed", "agent run failed");
      return "failed";
    }
    if (tasks.every((task) => task.status === "succeeded")) {
      this.state.updateRunStatus(runId, "succeeded", "agent run completed");
      return "succeeded";
    }
    return undefined;
  }
}
