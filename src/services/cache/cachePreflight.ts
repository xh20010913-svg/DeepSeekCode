import type { CachePinAuditReport } from "./cachePinAudit.js";
import type { CachePinSuggestion } from "./cachePinSuggestions.js";
import type { CacheReadinessReport } from "./cacheReadiness.js";
import type { CacheShapeObservation } from "./cacheShapeHistory.js";
import type { CacheStabilityReport } from "./cacheStability.js";
import type { CachePromptPlan } from "./resonixPolicy.js";

export type CachePreflightStatus = "ready" | "review" | "blocked";

export interface CachePreflightReport {
  goal: string;
  effort: string;
  status: CachePreflightStatus;
  planTokens: number;
  droppedChars: number;
  truncatedBlocks: string[];
  stabilityRisk: CacheStabilityReport["risk"];
  dynamicShare: number;
  shapeFingerprint: string;
  shapeRepeat: string;
  readinessScore: number;
  readinessStatus: CacheReadinessReport["status"];
  pinSeverity: CachePinAuditReport["severity"];
  pinCount: number;
  pinIssues: number;
  suggestionCount: number;
  topSuggestions: CachePinSuggestion[];
  recommendations: string[];
  nextCommands: string[];
}

export function buildCachePreflightReport(input: {
  goal: string;
  effort: string;
  plan: CachePromptPlan;
  stability: CacheStabilityReport;
  shapeObservation: CacheShapeObservation;
  readiness: CacheReadinessReport;
  pinAudit: CachePinAuditReport;
  suggestions: CachePinSuggestion[];
}): CachePreflightReport {
  const truncatedBlocks = input.plan.blocks.filter((block) => block.truncated).map((block) => block.title);
  const status = statusFor({
    readinessStatus: input.readiness.status,
    pinSeverity: input.pinAudit.severity,
    stabilityRisk: input.stability.risk,
    truncatedBlocks,
  });
  return {
    goal: input.goal,
    effort: input.effort,
    status,
    planTokens: input.plan.approxTokens,
    droppedChars: input.plan.droppedChars,
    truncatedBlocks,
    stabilityRisk: input.stability.risk,
    dynamicShare: input.stability.dynamicShare,
    shapeFingerprint: input.stability.shapeFingerprint,
    shapeRepeat: input.shapeObservation.repeated ? `repeat=${input.shapeObservation.record.count}` : "repeat=first",
    readinessScore: input.readiness.score,
    readinessStatus: input.readiness.status,
    pinSeverity: input.pinAudit.severity,
    pinCount: input.pinAudit.pinCount,
    pinIssues: input.pinAudit.items.length,
    suggestionCount: input.suggestions.length,
    topSuggestions: input.suggestions.slice(0, 3),
    recommendations: recommendationsFor({
      goal: input.goal,
      status,
      plan: input.plan,
      stability: input.stability,
      readiness: input.readiness,
      pinAudit: input.pinAudit,
      suggestions: input.suggestions,
    }),
    nextCommands: nextCommandsFor({
      goal: input.goal,
      status,
      plan: input.plan,
      stability: input.stability,
      readiness: input.readiness,
      pinAudit: input.pinAudit,
      suggestions: input.suggestions,
    }),
  };
}

export function formatCachePreflightReport(report: CachePreflightReport): string {
  return [
    `DeepSeek cache preflight: ${report.status} goal=${report.goal}`,
    `effort=${report.effort} readiness=${report.readinessStatus} score=${report.readinessScore}`,
    `plan tokens~${report.planTokens} droppedChars=${report.droppedChars} truncated=${report.truncatedBlocks.length ? report.truncatedBlocks.join(",") : "none"}`,
    `stability=${report.stabilityRisk} dynamicShare=${Math.round(report.dynamicShare * 100)}% shape=${report.shapeFingerprint} ${report.shapeRepeat}`,
    `pins count=${report.pinCount} severity=${report.pinSeverity} issues=${report.pinIssues}`,
    `suggestions=${report.suggestionCount}${report.topSuggestions.length ? ` top=${report.topSuggestions.map((item) => item.name).join(",")}` : ""}`,
    "recommendations:",
    ...report.recommendations.map((recommendation) => `- ${recommendation}`),
    "next commands:",
    ...report.nextCommands.map((command) => `- ${command}`),
  ].join("\n");
}

function statusFor(input: {
  readinessStatus: CacheReadinessReport["status"];
  pinSeverity: CachePinAuditReport["severity"];
  stabilityRisk: CacheStabilityReport["risk"];
  truncatedBlocks: string[];
}): CachePreflightStatus {
  if (input.pinSeverity === "error") return "blocked";
  if (input.stabilityRisk === "high" || input.truncatedBlocks.length > 0) return "review";
  if (input.readinessStatus === "ready" && input.stabilityRisk === "low") return "ready";
  return "review";
}

function recommendationsFor(input: {
  goal: string;
  status: CachePreflightStatus;
  plan: CachePromptPlan;
  stability: CacheStabilityReport;
  readiness: CacheReadinessReport;
  pinAudit: CachePinAuditReport;
  suggestions: CachePinSuggestion[];
}): string[] {
  const recommendations: string[] = [];
  if (input.pinAudit.severity === "error") {
    recommendations.push("Fix cache pin audit errors before sending this task to DeepSeek.");
  } else if (input.pinAudit.severity === "warning") {
    recommendations.push("Review /cache pin audit warnings before a large run.");
  }
  if (input.suggestions.some((suggestion) => !suggestion.alreadyPinned)) {
    recommendations.push("Run /cache pin apply <goal> to add suggested stable project facts.");
  }
  if (input.plan.droppedChars > 0 || input.stability.truncatedBlocks.length > 0) {
    recommendations.push("Narrow selected files, add stable facts as pins, or raise /effort before this request.");
  }
  if (input.stability.risk === "high") {
    recommendations.push("Dynamic context dominates this prompt shape; reduce changing context to improve cache hit odds.");
  }
  if (input.readiness.status === "cold") {
    recommendations.push("Run /cache plan <goal> and a small tool-backed request before a high-token task.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Preflight looks ready; keep the request shape stable and proceed with the flash model first.");
  }
  return recommendations;
}

function nextCommandsFor(input: {
  goal: string;
  status: CachePreflightStatus;
  plan: CachePromptPlan;
  stability: CacheStabilityReport;
  readiness: CacheReadinessReport;
  pinAudit: CachePinAuditReport;
  suggestions: CachePinSuggestion[];
}): string[] {
  const commands: string[] = [];
  if (input.pinAudit.severity !== "ok") {
    commands.push("/cache pin audit");
  }
  if (input.suggestions.some((suggestion) => !suggestion.alreadyPinned)) {
    commands.push(`/cache pin apply ${input.goal}`);
  }
  if (input.plan.droppedChars > 0 || input.stability.risk !== "low") {
    commands.push(`/cache plan ${input.goal}`);
  }
  if (input.readiness.status === "cold" || input.status !== "ready") {
    commands.push("/cache doctor");
  }
  if (commands.length === 0) {
    commands.push(`/cache plan ${input.goal}`);
  }
  return Array.from(new Set(commands));
}
