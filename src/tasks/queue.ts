import type { StateStore, TaskRecord } from "../state/sqlite.js";

export interface TaskSeed {
  agent: string;
  title: string;
  detail?: string;
}

export function createLinearTaskDag(
  state: StateStore,
  runId: string,
  tasks: TaskSeed[],
): string[] {
  const ids: string[] = [];
  for (const task of tasks) {
    const id = state.createTask({
      runId,
      agent: task.agent,
      title: task.title,
      detail: task.detail,
    });
    const previous = ids.at(-1);
    if (previous) state.addTaskDependency(id, previous);
    ids.push(id);
  }
  return ids;
}

export class DurableTaskQueue {
  constructor(private readonly state: StateStore) {}

  createLinearDag(runId: string, tasks: TaskSeed[]): string[] {
    return createLinearTaskDag(this.state, runId, tasks);
  }

  runnable(runId: string, limit = 20): TaskRecord[] {
    return this.state.listRunnableTasks(runId, limit);
  }

  claimNext(runId: string, claimant = "local-worker"): TaskRecord | undefined {
    return this.state.claimNextTask(runId, claimant);
  }

  complete(taskId: string, detail = "completed"): void {
    this.state.updateTaskStatus(taskId, "succeeded", detail);
  }

  retry(taskId: string, detail = "retry requested"): TaskRecord {
    return this.state.retryTask(taskId, detail);
  }

  retryFailed(runId: string, detail = "retry failed tasks"): TaskRecord[] {
    return this.state
      .listTasks(runId)
      .filter((task) => task.status === "failed" || task.status === "cancelled")
      .map((task) => this.retry(task.id, detail));
  }

  fail(taskId: string, detail = "failed"): void {
    this.state.updateTaskStatus(taskId, "failed", detail);
  }

  pauseRun(runId: string, reason = "paused by user"): void {
    this.state.updateRunStatus(runId, "paused", reason);
  }

  resumeRun(runId: string, reason = "resumed by user"): void {
    this.state.updateRunStatus(runId, "running", reason);
  }

  cancelRun(runId: string, reason = "cancelled by user"): void {
    this.state.updateRunStatus(runId, "cancelled", reason);
    for (const task of this.state.listTasks(runId)) {
      if (task.status !== "succeeded" && task.status !== "cancelled") {
        this.state.updateTaskStatus(task.id, "cancelled", reason);
      }
    }
    for (const job of this.state.listJobs({ runId, limit: 100 })) {
      if (job.status === "queued" || job.status === "running") {
        this.state.finishJob(job.id, "cancelled", reason);
      }
    }
  }
}
