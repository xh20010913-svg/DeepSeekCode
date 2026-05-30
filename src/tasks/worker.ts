import type { StateStore, TaskRecord } from "../state/sqlite.js";
import { DurableTaskQueue } from "./queue.js";

export interface WorkerStepResult {
  claimed?: TaskRecord;
  status: "idle" | "completed" | "failed";
  message: string;
}

export class DurableTaskWorker {
  private readonly queue: DurableTaskQueue;

  constructor(
    private readonly state: StateStore,
    private readonly claimant = `worker_${process.pid}`,
  ) {
    this.queue = new DurableTaskQueue(state);
  }

  async runOne(
    runId: string,
    handler: (task: TaskRecord) => Promise<string | void> | string | void,
  ): Promise<WorkerStepResult> {
    const task = this.queue.claimNext(runId, this.claimant);
    if (!task) {
      return { status: "idle", message: "no runnable task" };
    }

    try {
      const detail = await handler(task);
      this.queue.complete(task.id, detail || "completed");
      this.state.appendEvent(runId, "worker_step_completed", {
        task_id: task.id,
        claimant: this.claimant,
      });
      return { claimed: task, status: "completed", message: detail || "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.queue.fail(task.id, message);
      this.state.appendEvent(runId, "worker_step_failed", {
        task_id: task.id,
        claimant: this.claimant,
        message,
      });
      return { claimed: task, status: "failed", message };
    }
  }
}
