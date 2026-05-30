import { getUsageTotals } from "./cost-tracker.js";

export function useCostSummary(): ReturnType<typeof getUsageTotals> {
  return getUsageTotals();
}
