import { createHash } from "node:crypto";
import type { CacheBlockPriority, CachePromptPlan } from "./resonixPolicy.js";

export type CacheStabilityRisk = "low" | "medium" | "high";

export interface CacheStabilityReport {
  risk: CacheStabilityRisk;
  shapeFingerprint: string;
  stableChars: number;
  dynamicChars: number;
  requestChars: number;
  dynamicShare: number;
  truncatedBlocks: string[];
  stableTitles: string[];
  recommendation: string;
}

const STABLE_PRIORITIES = new Set<CacheBlockPriority>(["sticky", "project"]);
const DYNAMIC_PRIORITIES = new Set<CacheBlockPriority>(["context", "feedback"]);

export function buildCacheStabilityReport(plan: CachePromptPlan): CacheStabilityReport {
  const stableBlocks = plan.blocks.filter((block) => STABLE_PRIORITIES.has(block.priority));
  const dynamicBlocks = plan.blocks.filter((block) => DYNAMIC_PRIORITIES.has(block.priority));
  const requestBlocks = plan.blocks.filter((block) => block.priority === "request");
  const stableChars = sumChars(stableBlocks);
  const dynamicChars = sumChars(dynamicBlocks);
  const requestChars = sumChars(requestBlocks);
  const totalChars = Math.max(1, stableChars + dynamicChars + requestChars);
  const dynamicShare = dynamicChars / totalChars;
  const truncatedBlocks = plan.blocks.filter((block) => block.truncated).map((block) => block.title);
  const risk = classifyRisk({ stableChars, dynamicShare, truncatedBlocks, requestChars });
  return {
    risk,
    shapeFingerprint: fingerprintPlanShape(plan),
    stableChars,
    dynamicChars,
    requestChars,
    dynamicShare,
    truncatedBlocks,
    stableTitles: stableBlocks.map((block) => block.title),
    recommendation: recommendationFor(risk, truncatedBlocks.length),
  };
}

export function formatCacheStabilityReport(report: CacheStabilityReport): string {
  return [
    `stability=${report.risk}`,
    `stableChars=${report.stableChars}`,
    `dynamicShare=${Math.round(report.dynamicShare * 100)}%`,
    `shape=${report.shapeFingerprint}`,
  ].join(" ");
}

function classifyRisk(input: {
  stableChars: number;
  dynamicShare: number;
  truncatedBlocks: string[];
  requestChars: number;
}): CacheStabilityRisk {
  if (input.truncatedBlocks.length > 0 || input.dynamicShare >= 0.65) return "high";
  if (input.stableChars === 0 || input.dynamicShare >= 0.35 || input.requestChars > input.stableChars) return "medium";
  return "low";
}

function fingerprintPlanShape(plan: CachePromptPlan): string {
  const shape = plan.blocks.map((block) => [
    block.priority,
    block.title,
    bucketChars(block.chars),
    block.truncated ? "cut" : "full",
  ].join(":")).join("|");
  return createHash("sha256").update(shape).digest("hex").slice(0, 12);
}

function bucketChars(chars: number): string {
  if (chars <= 0) return "0";
  if (chars < 512) return "<512";
  if (chars < 2048) return "<2k";
  if (chars < 8192) return "<8k";
  return ">=8k";
}

function sumChars(blocks: CachePromptPlan["blocks"]): number {
  return blocks.reduce((sum, block) => sum + block.chars, 0);
}

function recommendationFor(risk: CacheStabilityRisk, truncatedCount: number): string {
  if (risk === "low") return "Stable prefix looks healthy; keep pins and project facts ahead of changing context.";
  if (truncatedCount > 0) return "Move repeat facts into cache pins and narrow selected files before spending a large DeepSeek turn.";
  if (risk === "high") return "Dynamic context dominates the prompt; pin invariants or lower context breadth to improve cache hits.";
  return "Cache shape is acceptable, but more stable project/pin content would improve repeat-hit odds.";
}
