import type { RunRecord, StateStore } from "../state/sqlite.js";

export function useRuns(state: StateStore, limit = 10): RunRecord[] {
  return state.listRuns(limit);
}

export function useLatestRun(state: StateStore): RunRecord | undefined {
  return useRuns(state, 1)[0];
}
