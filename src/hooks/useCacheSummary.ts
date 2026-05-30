import { summarizeCacheTelemetry } from "../services/cache/telemetry.js";
import type { StateStore } from "../state/sqlite.js";

export function useCacheSummary(state: StateStore) {
  return summarizeCacheTelemetry(state.listRuns(20));
}
