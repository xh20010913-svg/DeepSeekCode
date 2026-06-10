import {
  buildPromptBudgetPlan,
  type GovernedPromptBlock,
  type PromptBudgetPlan,
} from "../context/promptBudgetGovernor.js";

export type CacheBlockPriority = "sticky" | "project" | "context" | "feedback" | "request";

export interface CachePromptBlock {
  title: string;
  body: string;
  priority: CacheBlockPriority;
}

export interface CachePromptPlan extends Pick<
  PromptBudgetPlan,
  "budgetPlanId" | "userMessage" | "approxTokens" | "dynamicChars" | "maxDynamicChars" | "droppedChars" | "droppedBlocks" | "stableHash" | "dynamicHash" | "dynamicShare" | "diagnostics"
> {
  userMessage: string;
  approxTokens: number;
  droppedChars: number;
  blocks: Array<{
    title: string;
    priority: CacheBlockPriority;
    chars: number;
    truncated: boolean;
  }>;
}

export function buildResonixPromptPlan(
  blocks: CachePromptBlock[],
  options: { maxDynamicChars: number; stableHash?: string; phase?: string },
): CachePromptPlan {
  return buildPromptBudgetPlan({
    blocks: blocks as GovernedPromptBlock[],
    maxDynamicChars: options.maxDynamicChars,
    stableHash: options.stableHash,
    phase: options.phase,
  });
}

export function cachePlanSummary(plan: CachePromptPlan): string {
  const truncated = plan.blocks.filter((block) => block.truncated).map((block) => block.title);
  return [
    `budgetPlanId=${plan.budgetPlanId}`,
    `stableHash=${plan.stableHash ?? "none"}`,
    `dynamicHash=${plan.dynamicHash}`,
    `dynamicTokens~${plan.approxTokens}`,
    `dynamicChars=${plan.dynamicChars}/${plan.maxDynamicChars}`,
    `droppedChars=${plan.droppedChars}`,
    `droppedBlocks=${plan.droppedBlocks.length ? plan.droppedBlocks.join(",") : "none"}`,
    `truncated=${truncated.length ? truncated.join(",") : "none"}`,
  ].join(" ");
}
