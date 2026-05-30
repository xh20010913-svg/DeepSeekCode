import type { CachePreflightReport } from "./cachePreflight.js";
import type { CacheProfileForecast } from "./cacheProfiles.js";

export type CacheGuardDecision = "run" | "prepare" | "block";

export interface CacheGuardReport {
  goal: string;
  decision: CacheGuardDecision;
  profile: string;
  preflightStatus: CachePreflightReport["status"];
  forecastStatus: CacheProfileForecast["status"];
  readinessScore: number;
  estimatedHitRate: number;
  stableTokens: number;
  dynamicTokens: number;
  reusableTokens: number;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  nextCommands: string[];
}

export function buildCacheGuardReport(input: {
  preflight: CachePreflightReport;
  forecast: CacheProfileForecast;
  minHitRate?: number;
}): CacheGuardReport {
  const minHitRate = Math.max(0, Math.min(1, input.minHitRate ?? 0.35));
  const blockers = guardBlockers(input.preflight, input.forecast);
  const warnings = guardWarnings(input.preflight, input.forecast, minHitRate);
  const decision = blockers.length > 0
    ? "block"
    : warnings.length > 0
      ? "prepare"
      : "run";
  return {
    goal: input.preflight.goal,
    decision,
    profile: input.forecast.profile?.name ?? "none",
    preflightStatus: input.preflight.status,
    forecastStatus: input.forecast.status,
    readinessScore: input.preflight.readinessScore,
    estimatedHitRate: input.forecast.estimatedHitRate,
    stableTokens: input.forecast.stableTokens,
    dynamicTokens: input.forecast.dynamicTokens,
    reusableTokens: input.forecast.reusableTokens,
    blockers,
    warnings,
    recommendations: guardRecommendations(decision, input.preflight, input.forecast),
    nextCommands: guardNextCommands(decision, input.preflight, input.forecast),
  };
}

export function formatCacheGuardReport(report: CacheGuardReport): string {
  return [
    `DeepSeek cache guard: ${report.decision} goal=${report.goal}`,
    `profile=${report.profile} preflight=${report.preflightStatus} forecast=${report.forecastStatus} readiness=${report.readinessScore}`,
    `tokens stable~${report.stableTokens} dynamic~${report.dynamicTokens} reusable~${report.reusableTokens} estimatedHit=${Math.round(report.estimatedHitRate * 100)}%`,
    `blockers=${report.blockers.length ? report.blockers.join("; ") : "none"}`,
    `warnings=${report.warnings.length ? report.warnings.join("; ") : "none"}`,
    "recommendations:",
    ...report.recommendations.map((item) => `- ${item}`),
    "next commands:",
    ...report.nextCommands.map((command) => `- ${command}`),
  ].join("\n");
}

function guardBlockers(preflight: CachePreflightReport, forecast: CacheProfileForecast): string[] {
  const blockers: string[] = [];
  if (preflight.status === "blocked") {
    blockers.push("preflight is blocked");
  }
  if (forecast.status === "blocked") {
    blockers.push("matched profile or current cache shape is blocked");
  }
  if (preflight.pinSeverity === "error") {
    blockers.push("cache pin audit has errors");
  }
  return Array.from(new Set(blockers));
}

function guardWarnings(
  preflight: CachePreflightReport,
  forecast: CacheProfileForecast,
  minHitRate: number,
): string[] {
  const warnings: string[] = [];
  if (preflight.status === "review") {
    warnings.push("preflight still needs review");
  }
  if (forecast.status !== "strong") {
    warnings.push(`profile forecast is ${forecast.status}`);
  }
  if (forecast.estimatedHitRate < minHitRate) {
    warnings.push(`estimated cache hit below ${Math.round(minHitRate * 100)}%`);
  }
  if (preflight.dynamicShare >= 0.65) {
    warnings.push("dynamic prompt share is high");
  }
  if (preflight.droppedChars > 0 || preflight.truncatedBlocks.length > 0) {
    warnings.push("prompt context was truncated");
  }
  return Array.from(new Set(warnings));
}

function guardRecommendations(
  decision: CacheGuardDecision,
  preflight: CachePreflightReport,
  forecast: CacheProfileForecast,
): string[] {
  if (decision === "run") {
    return ["Cache shape looks ready; run the task with the flash model first and keep the prompt prefix stable."];
  }
  const recommendations: string[] = [];
  if (decision === "block") {
    recommendations.push("Do not send a large DeepSeek request yet; fix blocking cache or pin issues first.");
  }
  if (forecast.profile !== undefined) {
    recommendations.push(`Refresh profile ${forecast.profile.name} before the full run.`);
  } else {
    recommendations.push("Prepare and save a reusable cache profile for this task shape.");
  }
  if (preflight.suggestionCount > 0) {
    recommendations.push("Apply stable pin suggestions to increase prefix reuse.");
  }
  if (preflight.dynamicShare >= 0.65 || preflight.droppedChars > 0) {
    recommendations.push("Reduce dynamic selected context or raise the effort budget before sending the request.");
  }
  return Array.from(new Set(recommendations));
}

function guardNextCommands(
  decision: CacheGuardDecision,
  preflight: CachePreflightReport,
  forecast: CacheProfileForecast,
): string[] {
  const commands: string[] = [];
  if (preflight.pinSeverity !== "ok") {
    commands.push("/cache pin audit");
  }
  if (preflight.suggestionCount > 0) {
    commands.push(`/cache pin apply ${preflight.goal}`);
  }
  if (forecast.profile) {
    commands.push(`/cache profile prepare ${forecast.profile.name}`);
  } else {
    commands.push(`/cache prepare ${preflight.goal}`);
    commands.push(`/cache profile save <name> ${preflight.goal}`);
  }
  commands.push(`/cache profile forecast ${preflight.goal}`);
  if (decision === "run") {
    commands.unshift(`/cache preflight ${preflight.goal}`);
  }
  return Array.from(new Set(commands));
}
