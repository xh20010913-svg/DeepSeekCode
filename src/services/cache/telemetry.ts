import { cacheRate } from "../../query/promptCache.js";
import type { RunRecord } from "../../state/sqlite.js";

export interface CacheTelemetrySummary {
  hitTokens: number;
  missTokens: number;
  rate: string;
  observedRuns: number;
}

export function summarizeCacheTelemetry(runs: RunRecord[]): CacheTelemetrySummary {
  const hitTokens = runs.reduce((sum, run) => sum + (run.cacheHitTokens ?? 0), 0);
  const missTokens = runs.reduce((sum, run) => sum + (run.cacheMissTokens ?? 0), 0);
  const observedRuns = runs.filter(
    (run) => (run.cacheHitTokens ?? 0) > 0 || (run.cacheMissTokens ?? 0) > 0,
  ).length;
  return {
    hitTokens,
    missTokens,
    rate: cacheRate(hitTokens, missTokens),
    observedRuns,
  };
}
