import type { StateStore, TaskRecord } from "../state/sqlite.js";

export function useTasks(state: StateStore, runId?: string): TaskRecord[] {
  return runId ? state.listTasks(runId) : [];
}
