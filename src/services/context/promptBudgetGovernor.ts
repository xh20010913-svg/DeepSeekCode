import crypto from "node:crypto";
import { approximateTokens, buildDynamicPromptBlock } from "../../query/promptCache.js";

export type PromptBlockPriority = "sticky" | "project" | "context" | "feedback" | "request";

export interface GovernedPromptBlock {
  title: string;
  body: string;
  priority: PromptBlockPriority;
}

export interface PromptBudgetInput {
  blocks: GovernedPromptBlock[];
  maxDynamicChars: number;
  stableHash?: string;
  phase?: string;
}

export interface PromptBudgetPlan {
  userMessage: string;
  approxTokens: number;
  dynamicChars: number;
  maxDynamicChars: number;
  droppedChars: number;
  droppedBlocks: string[];
  stableHash?: string;
  dynamicHash: string;
  dynamicShare: number;
  blocks: Array<{
    title: string;
    priority: PromptBlockPriority;
    chars: number;
    originalChars: number;
    truncated: boolean;
  }>;
  diagnostics: {
    phase?: string;
    overBudget: boolean;
    recommendations: string[];
  };
}

const PRIORITY_ORDER: Record<PromptBlockPriority, number> = {
  sticky: 0,
  project: 1,
  context: 2,
  feedback: 3,
  request: 4,
};

export function buildPromptBudgetPlan(input: PromptBudgetInput): PromptBudgetPlan {
  const ordered = [...input.blocks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const requestChars = ordered
    .filter((block) => block.priority === "request")
    .reduce((sum, block) => sum + normalizeBlockBody(block.body).length, 0);
  let remaining = Math.max(requestChars, input.maxDynamicChars);
  let droppedChars = 0;
  const droppedBlocks: string[] = [];

  const planned = ordered.map((block) => {
    const body = normalizeBlockBody(block.body);
    if (block.priority === "request") {
      remaining -= body.length;
      return { ...block, body, originalChars: body.length, truncated: false };
    }
    const clipped = body.slice(0, Math.max(0, remaining));
    remaining -= clipped.length;
    const dropped = Math.max(0, body.length - clipped.length);
    droppedChars += dropped;
    if (dropped > 0) droppedBlocks.push(block.title);
    return {
      ...block,
      body: clipped || "(omitted by prompt budget)",
      originalChars: body.length,
      truncated: clipped.length < body.length,
    };
  });

  const userMessage = buildDynamicPromptBlock(planned.map((block) => ({
    title: block.title,
    body: block.body,
  })));
  const dynamicChars = userMessage.length;
  const approxTokens = approximateTokens(userMessage);
  const dynamicHash = sha256(userMessage).slice(0, 16);
  const dynamicShare = dynamicChars <= 0
    ? 0
    : Math.min(1, dynamicChars / Math.max(1, input.maxDynamicChars));

  return {
    userMessage,
    approxTokens,
    dynamicChars,
    maxDynamicChars: input.maxDynamicChars,
    droppedChars,
    droppedBlocks,
    stableHash: input.stableHash,
    dynamicHash,
    dynamicShare,
    blocks: planned.map((block) => ({
      title: block.title,
      priority: block.priority,
      chars: block.body.length,
      originalChars: block.originalChars,
      truncated: block.truncated,
    })),
    diagnostics: {
      phase: input.phase,
      overBudget: droppedChars > 0 || dynamicChars > input.maxDynamicChars + requestChars,
      recommendations: recommendationsFor(droppedChars, dynamicShare, droppedBlocks),
    },
  };
}

export function formatPromptBudgetPlan(plan: PromptBudgetPlan): string {
  return [
    `prompt budget${plan.diagnostics.phase ? ` phase=${plan.diagnostics.phase}` : ""}`,
    `stableHash=${plan.stableHash ?? "none"} dynamicHash=${plan.dynamicHash}`,
    `dynamic=${plan.dynamicChars}/${plan.maxDynamicChars} chars tokens~${plan.approxTokens} share=${Math.round(plan.dynamicShare * 100)}%`,
    `droppedChars=${plan.droppedChars} droppedBlocks=${plan.droppedBlocks.join(",") || "none"}`,
    "recommendations:",
    ...(plan.diagnostics.recommendations.length
      ? plan.diagnostics.recommendations.map((item) => `- ${item}`)
      : ["- Prompt shape is within the current budget."]),
  ].join("\n");
}

function recommendationsFor(droppedChars: number, dynamicShare: number, droppedBlocks: string[]): string[] {
  const recommendations: string[] = [];
  if (droppedChars > 0) {
    recommendations.push("\u5df2\u538b\u7f29\u4f4e\u4f18\u5148\u7ea7\u4e0a\u4e0b\u6587\uff0c\u4f18\u5148\u4fdd\u7559\u5f53\u524d\u8bf7\u6c42\u3001\u5931\u8d25\u6458\u8981\u3001checkpoint \u548c\u771f\u5b9e evidence\u3002");
  }
  if (dynamicShare >= 0.85) {
    recommendations.push("\u52a8\u6001\u4e0a\u4e0b\u6587\u5360\u6bd4\u504f\u9ad8\uff1b\u5e94\u51cf\u5c11 selected_context\u3001memory recall \u6216\u5386\u53f2\u5bf9\u8bdd\u3002");
  }
  if (droppedBlocks.some((title) => /selected_context|repository_map/i.test(title))) {
    recommendations.push("\u9879\u76ee\u4e0a\u4e0b\u6587\u88ab\u622a\u65ad\uff1b\u5efa\u8bae\u7528 grep/read_file \u7cbe\u51c6\u8bfb\u53d6\u76f8\u5173\u6587\u4ef6\uff0c\u800c\u4e0d\u662f\u6574\u5305\u585e\u5165 prompt\u3002");
  }
  return recommendations;
}

function normalizeBlockBody(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
