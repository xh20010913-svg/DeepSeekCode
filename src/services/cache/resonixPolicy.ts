import { approximateTokens, buildDynamicPromptBlock } from "../../query/promptCache.js";

export type CacheBlockPriority = "sticky" | "project" | "context" | "feedback" | "request";

export interface CachePromptBlock {
  title: string;
  body: string;
  priority: CacheBlockPriority;
}

export interface CachePromptPlan {
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

const PRIORITY_ORDER: Record<CacheBlockPriority, number> = {
  sticky: 0,
  project: 1,
  context: 2,
  feedback: 3,
  request: 4,
};

export function buildResonixPromptPlan(
  blocks: CachePromptBlock[],
  options: { maxDynamicChars: number },
): CachePromptPlan {
  const ordered = [...blocks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const requestChars = ordered
    .filter((block) => block.priority === "request")
    .reduce((sum, block) => sum + block.body.length, 0);
  let remaining = Math.max(requestChars, options.maxDynamicChars);
  let droppedChars = 0;
  const planned = ordered.map((block) => {
    const body = block.body.trim();
    if (block.priority === "request") {
      remaining -= body.length;
      return { ...block, body, truncated: false, originalChars: body.length };
    }
    const clipped = body.slice(0, Math.max(0, remaining));
    remaining -= clipped.length;
    droppedChars += Math.max(0, body.length - clipped.length);
    return {
      ...block,
      body: clipped || "(omitted by prompt budget)",
      truncated: clipped.length < body.length,
      originalChars: body.length,
    };
  });

  const userMessage = buildDynamicPromptBlock(planned.map((block) => ({
    title: block.title,
    body: block.body,
  })));
  return {
    userMessage,
    approxTokens: approximateTokens(userMessage),
    droppedChars,
    blocks: planned.map((block) => ({
      title: block.title,
      priority: block.priority,
      chars: block.body.length,
      truncated: block.truncated,
    })),
  };
}

export function cachePlanSummary(plan: CachePromptPlan): string {
  const truncated = plan.blocks.filter((block) => block.truncated).map((block) => block.title);
  return [
    `dynamicTokens~${plan.approxTokens}`,
    `droppedChars=${plan.droppedChars}`,
    `truncated=${truncated.length ? truncated.join(",") : "none"}`,
  ].join(" ");
}
