import type { CachePinAuditReport } from "./cachePinAudit.js";
import type { CacheShapeRecord } from "./cacheShapeHistory.js";
import type { CacheTelemetrySummary } from "./telemetry.js";

export type CacheReadinessStatus = "ready" | "review" | "cold";

export interface CacheReadinessReport {
  score: number;
  status: CacheReadinessStatus;
  telemetry: CacheTelemetrySummary;
  pinSeverity: CachePinAuditReport["severity"];
  pinCount: number;
  pinIssues: number;
  totalPinChars: number;
  totalShapes: number;
  repeatedShapes: number;
  riskyShapes: number;
  latestShape?: string;
  recommendations: string[];
}

export function buildCacheReadinessReport(input: {
  telemetry: CacheTelemetrySummary;
  pinAudit: CachePinAuditReport;
  shapes: CacheShapeRecord[];
}): CacheReadinessReport {
  const totalTelemetryTokens = input.telemetry.hitTokens + input.telemetry.missTokens;
  const hitRatio = totalTelemetryTokens > 0 ? input.telemetry.hitTokens / totalTelemetryTokens : 0;
  const repeatedShapes = input.shapes.filter((shape) => shape.count > 1).length;
  const riskyShapes = input.shapes.filter((shape) => shape.risk !== "low").length;
  const score = clampScore(
    telemetryScore(totalTelemetryTokens, hitRatio)
      + pinScore(input.pinAudit)
      + shapeScore(input.shapes.length, repeatedShapes, riskyShapes),
  );
  return {
    score,
    status: statusFor(score, input.pinAudit.severity),
    telemetry: input.telemetry,
    pinSeverity: input.pinAudit.severity,
    pinCount: input.pinAudit.pinCount,
    pinIssues: input.pinAudit.items.length,
    totalPinChars: input.pinAudit.totalChars,
    totalShapes: input.shapes.length,
    repeatedShapes,
    riskyShapes,
    latestShape: input.shapes[0]?.fingerprint,
    recommendations: recommendationsFor({
      score,
      totalTelemetryTokens,
      hitRatio,
      pinAudit: input.pinAudit,
      shapeCount: input.shapes.length,
      repeatedShapes,
      riskyShapes,
    }),
  };
}

export function formatCacheReadinessReport(report: CacheReadinessReport): string {
  return [
    `DeepSeek cache readiness: ${report.status} score=${report.score}`,
    `telemetry hit=${report.telemetry.hitTokens} miss=${report.telemetry.missTokens} rate=${report.telemetry.rate} runs=${report.telemetry.observedRuns}`,
    `pins count=${report.pinCount} chars=${report.totalPinChars} severity=${report.pinSeverity} issues=${report.pinIssues}`,
    `shapes count=${report.totalShapes} repeated=${report.repeatedShapes} risky=${report.riskyShapes}${report.latestShape ? ` latest=${report.latestShape}` : ""}`,
    "recommendations:",
    ...report.recommendations.map((recommendation) => `- ${recommendation}`),
  ].join("\n");
}

function telemetryScore(totalTokens: number, hitRatio: number): number {
  if (totalTokens <= 0) return 0;
  if (hitRatio >= 0.75) return 40;
  if (hitRatio >= 0.6) return 34;
  if (hitRatio >= 0.35) return 22;
  return 12;
}

function pinScore(report: CachePinAuditReport): number {
  if (report.pinCount === 0) return 5;
  if (report.severity === "error") return 0;
  if (report.severity === "warning") return 14;
  return 30;
}

function shapeScore(totalShapes: number, repeatedShapes: number, riskyShapes: number): number {
  if (totalShapes === 0) return 0;
  const base = Math.min(18, repeatedShapes * 8 + Math.min(totalShapes, 3) * 3);
  return Math.max(4, base - riskyShapes * 5);
}

function statusFor(score: number, pinSeverity: CachePinAuditReport["severity"]): CacheReadinessStatus {
  if (pinSeverity === "error" || score < 35) return "cold";
  if (score < 70 || pinSeverity === "warning") return "review";
  return "ready";
}

function recommendationsFor(input: {
  score: number;
  totalTelemetryTokens: number;
  hitRatio: number;
  pinAudit: CachePinAuditReport;
  shapeCount: number;
  repeatedShapes: number;
  riskyShapes: number;
}): string[] {
  const recommendations: string[] = [];
  if (input.pinAudit.pinCount === 0) {
    recommendations.push("Run /cache pin apply <goal> to create stable DeepSeek prefix facts.");
  } else if (input.pinAudit.severity !== "ok") {
    recommendations.push("Run /cache pin audit and fix warnings before large DeepSeek runs.");
  }
  if (input.shapeCount === 0) {
    recommendations.push("Run /cache plan <goal> once to record a content-free prompt shape.");
  } else if (input.repeatedShapes === 0) {
    recommendations.push("Repeat /cache plan with the same task shape to improve prefix reuse confidence.");
  }
  if (input.riskyShapes > 0) {
    recommendations.push("Reduce dynamic context or pin stable facts; some prompt shapes have medium/high churn risk.");
  }
  if (input.totalTelemetryTokens === 0) {
    recommendations.push("Run a small tool-backed request to collect actual DeepSeek cache telemetry.");
  } else if (input.hitRatio < 0.6) {
    recommendations.push("Use /cache doctor to inspect low-cache runs and prefix drift.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Cache readiness looks strong; keep stable blocks first and dynamic context narrow.");
  }
  return recommendations;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
