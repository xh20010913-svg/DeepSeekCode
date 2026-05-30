import type { StateStore, TaskRecord } from "../../state/sqlite.js";

export class TaskService {
  constructor(private readonly state: StateStore) {}

  listForRun(runId: string): TaskRecord[] {
    return this.state.listTasks(runId);
  }

  summarize(runId: string): string {
    const tasks = this.listForRun(runId);
    if (tasks.length === 0) return "no tasks";
    return tasks.map((task) => `${task.status}:${task.agent}`).join(", ");
  }
}
