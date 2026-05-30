import type { UsageSnapshot } from "./protocol/provider.js";

export interface CostTotals {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

const totals: CostTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
};

export function recordUsageSnapshot(usage: UsageSnapshot): CostTotals {
  totals.inputTokens += usage.inputTokens ?? 0;
  totals.outputTokens += usage.outputTokens ?? 0;
  totals.cacheHitTokens += usage.cacheHitTokens ?? 0;
  totals.cacheMissTokens += usage.cacheMissTokens ?? 0;
  return getUsageTotals();
}

export function getUsageTotals(): CostTotals {
  return { ...totals };
}

export function resetUsageTotals(): void {
  totals.inputTokens = 0;
  totals.outputTokens = 0;
  totals.cacheHitTokens = 0;
  totals.cacheMissTokens = 0;
}

export function getTotalInputTokens(): number {
  return totals.inputTokens;
}

export function getTotalOutputTokens(): number {
  return totals.outputTokens;
}
