import fs from "node:fs";
import path from "node:path";
import type { CachePreflightReport } from "./cachePreflight.js";

export interface CacheProfile {
  name: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  effort: string;
  status: CachePreflightReport["status"];
  readinessScore: number;
  readinessStatus: CachePreflightReport["readinessStatus"];
  stabilityRisk: CachePreflightReport["stabilityRisk"];
  dynamicShare: number;
  shapeFingerprint: string;
  shapeRepeat: string;
  planTokens: number;
  droppedChars: number;
  pinNames: string[];
  recommendations: string[];
  nextCommands: string[];
}

export interface CacheProfileMatch {
  profile: CacheProfile;
  score: number;
  reason: string;
  command: string;
}

export type CacheProfileAuditSeverity = "ok" | "warning" | "error";

export interface CacheProfileAuditIssue {
  profile: string;
  severity: Exclude<CacheProfileAuditSeverity, "ok">;
  code: string;
  message: string;
  command: string;
}

export interface CacheProfileAuditReport {
  severity: CacheProfileAuditSeverity;
  profileCount: number;
  healthyCount: number;
  issueCount: number;
  issues: CacheProfileAuditIssue[];
  recommendation: string;
}

export interface CacheProfileCleanupCandidate {
  profile: string;
  severity: CacheProfileAuditIssue["severity"];
  codes: string[];
  reason: string;
  command: string;
}

export interface CacheProfileCleanupPlan {
  apply: boolean;
  candidateCount: number;
  removed: string[];
  candidates: CacheProfileCleanupCandidate[];
  recommendation: string;
}

export type CacheProfileForecastStatus = "strong" | "warming" | "cold" | "blocked";

export interface CacheProfileForecast {
  goal: string;
  status: CacheProfileForecastStatus;
  preflightStatus: CachePreflightReport["status"];
  profile?: CacheProfile;
  match?: CacheProfileMatch;
  currentTokens: number;
  stableTokens: number;
  dynamicTokens: number;
  profileStableTokens: number;
  reusableTokens: number;
  estimatedHitRate: number;
  reason: string;
  recommendations: string[];
  nextCommands: string[];
}

export class CacheProfileService {
  private readonly dir: string;

  constructor(private readonly projectPath: string) {
    this.dir = path.join(projectPath, ".deepseekcode", "cache-profiles");
  }

  list(): CacheProfile[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => this.load(entry.name.slice(0, -".json".length)))
      .filter((profile): profile is CacheProfile => Boolean(profile))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }

  load(name: string): CacheProfile | undefined {
    const normalized = normalizeCacheProfileName(name);
    if (!normalized) return undefined;
    const profilePath = this.profilePath(normalized);
    if (!fs.existsSync(profilePath)) return undefined;
    try {
      return normalizeProfile(JSON.parse(fs.readFileSync(profilePath, "utf8")), normalized);
    } catch {
      return undefined;
    }
  }

  saveFromPreflight(input: {
    name: string;
    preflight: CachePreflightReport;
    pinNames: string[];
  }): CacheProfile {
    const normalized = normalizeCacheProfileName(input.name);
    if (!normalized) throw new Error("cache profile name must use letters, numbers, dot, underscore, or dash");
    const existing = this.load(normalized);
    const now = new Date().toISOString();
    const profile: CacheProfile = {
      name: normalized,
      goal: input.preflight.goal,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      effort: input.preflight.effort,
      status: input.preflight.status,
      readinessScore: input.preflight.readinessScore,
      readinessStatus: input.preflight.readinessStatus,
      stabilityRisk: input.preflight.stabilityRisk,
      dynamicShare: input.preflight.dynamicShare,
      shapeFingerprint: input.preflight.shapeFingerprint,
      shapeRepeat: input.preflight.shapeRepeat,
      planTokens: input.preflight.planTokens,
      droppedChars: input.preflight.droppedChars,
      pinNames: Array.from(new Set(input.pinNames)).sort((a, b) => a.localeCompare(b)),
      recommendations: input.preflight.recommendations.slice(0, 6),
      nextCommands: input.preflight.nextCommands.slice(0, 6),
    };
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.profilePath(normalized), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    return profile;
  }

  remove(name: string): boolean {
    const normalized = normalizeCacheProfileName(name);
    if (!normalized) return false;
    const profilePath = this.profilePath(normalized);
    if (!fs.existsSync(profilePath)) return false;
    fs.unlinkSync(profilePath);
    return true;
  }

  path(name?: string): string {
    const normalized = name ? normalizeCacheProfileName(name) : undefined;
    return normalized ? this.profilePath(normalized) : this.dir;
  }

  private profilePath(name: string): string {
    return path.join(this.dir, `${name}.json`);
  }
}

export function formatCacheProfile(profile: CacheProfile): string {
  return [
    `cache profile ${profile.name}`,
    `goal=${profile.goal}`,
    `status=${profile.status} readiness=${profile.readinessStatus} score=${profile.readinessScore} effort=${profile.effort}`,
    `shape=${profile.shapeFingerprint} ${profile.shapeRepeat} stability=${profile.stabilityRisk} dynamicShare=${Math.round(profile.dynamicShare * 100)}%`,
    `plan tokens~${profile.planTokens} droppedChars=${profile.droppedChars}`,
    `pins=${profile.pinNames.length ? profile.pinNames.join(",") : "none"}`,
    `updated=${profile.updatedAt}`,
    "recommendations:",
    ...profile.recommendations.map((item) => `- ${item}`),
    "next commands:",
    ...profile.nextCommands.map((item) => `- ${item}`),
  ].join("\n");
}

export function formatCacheProfileList(profiles: CacheProfile[]): string {
  if (profiles.length === 0) {
    return "No cache profiles. Save one with /cache profile save <name> <goal>.";
  }
  return profiles.map((profile) => [
    `${profile.name} status=${profile.status} score=${profile.readinessScore} shape=${profile.shapeFingerprint}`,
    `  goal=${profile.goal}`,
    `  pins=${profile.pinNames.length} updated=${profile.updatedAt}`,
  ].join("\n")).join("\n");
}

export function matchCacheProfiles(
  profiles: CacheProfile[],
  goal: string,
  limit = 5,
): CacheProfileMatch[] {
  const goalTokens = tokenize(goal);
  if (profiles.length === 0) return [];
  return profiles
    .map((profile) => {
      const profileTokens = tokenize([
        profile.name,
        profile.goal,
        profile.pinNames.join(" "),
        profile.recommendations.join(" "),
      ].join(" "));
      const overlap = Array.from(goalTokens).filter((token) => profileTokens.has(token));
      const score = Math.max(0,
        overlap.length * 25
          + readinessBonus(profile)
          + pinBonus(profile)
          + recencyBonus(profile)
          - riskPenalty(profile),
      );
      return {
        profile,
        score,
        reason: reasonForProfileMatch(profile, overlap),
        command: `/cache profile prepare ${profile.name}`,
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || b.profile.updatedAt.localeCompare(a.profile.updatedAt) || a.profile.name.localeCompare(b.profile.name))
    .slice(0, Math.max(1, Math.min(10, limit)));
}

export function formatCacheProfileMatches(goal: string, matches: CacheProfileMatch[]): string {
  if (matches.length === 0) {
    return [
      `No cache profile match found for goal=${goal}`,
      "Save one with /cache profile save <name> <goal>, or start with /cache prepare <goal>.",
    ].join("\n");
  }
  return [
    `cache profile matches goal=${goal}`,
    ...matches.map((match, index) => [
      `${index + 1}. ${match.profile.name} score=${match.score} status=${match.profile.status} readiness=${match.profile.readinessScore}`,
      `   goal=${match.profile.goal}`,
      `   reason=${match.reason}`,
      `   command=${match.command}`,
    ].join("\n")),
  ].join("\n");
}

export function auditCacheProfiles(
  profiles: CacheProfile[],
  options: { now?: Date; staleDays?: number } = {},
): CacheProfileAuditReport {
  const now = options.now?.getTime() ?? Date.now();
  const staleDays = Math.max(1, options.staleDays ?? 45);
  const issues = profiles.flatMap((profile) => auditProfile(profile, now, staleDays));
  const severity = issues.some((issue) => issue.severity === "error")
    ? "error"
    : issues.some((issue) => issue.severity === "warning")
      ? "warning"
      : "ok";
  const unhealthy = new Set(issues.map((issue) => issue.profile));
  return {
    severity,
    profileCount: profiles.length,
    healthyCount: profiles.length - unhealthy.size,
    issueCount: issues.length,
    issues,
    recommendation: recommendationForAudit(severity, profiles.length),
  };
}

export function formatCacheProfileAudit(report: CacheProfileAuditReport): string {
  const lines = [
    `cache profile audit: severity=${report.severity} profiles=${report.profileCount} healthy=${report.healthyCount} issues=${report.issueCount}`,
    report.recommendation,
  ];
  for (const issue of report.issues.slice(0, 20)) {
    lines.push(`${issue.severity} ${issue.profile} ${issue.code}: ${issue.message}`);
    lines.push(`  command=${issue.command}`);
  }
  if (report.issues.length > 20) {
    lines.push(`... ${report.issues.length - 20} more issues`);
  }
  return lines.join("\n");
}

export function buildCacheProfileCleanupPlan(
  report: CacheProfileAuditReport,
  options: { apply?: boolean; removed?: string[] } = {},
): CacheProfileCleanupPlan {
  const candidates = cleanupCandidates(report);
  return {
    apply: Boolean(options.apply),
    candidateCount: candidates.length,
    removed: options.removed ?? [],
    candidates,
    recommendation: candidates.length === 0
      ? "No cache profiles need cleanup. Use /cache profile audit to review profile health."
      : options.apply
        ? "Selected cache profiles were removed. Run /cache profile audit again to verify the profile set."
        : "Review the candidates, then run /cache profile clean --apply to remove them.",
  };
}

export function formatCacheProfileCleanup(plan: CacheProfileCleanupPlan): string {
  const lines = [
    `cache profile clean: mode=${plan.apply ? "apply" : "preview"} candidates=${plan.candidateCount} removed=${plan.removed.length}`,
    plan.recommendation,
  ];
  for (const candidate of plan.candidates.slice(0, 20)) {
    const removed = plan.removed.includes(candidate.profile) ? " removed" : "";
    lines.push(`${candidate.severity} ${candidate.profile}${removed}: ${candidate.reason}`);
    lines.push(`  codes=${candidate.codes.join(",")}`);
    lines.push(`  command=${candidate.command}`);
  }
  if (plan.candidates.length > 20) {
    lines.push(`... ${plan.candidates.length - 20} more cleanup candidates`);
  }
  return lines.join("\n");
}

export function buildCacheProfileForecast(input: {
  goal: string;
  preflight: CachePreflightReport;
  matches: CacheProfileMatch[];
}): CacheProfileForecast {
  const match = input.matches[0];
  const currentTokens = Math.max(0, input.preflight.planTokens);
  const stableTokens = stableTokenEstimate(input.preflight.planTokens, input.preflight.dynamicShare);
  const dynamicTokens = Math.max(0, currentTokens - stableTokens);
  if (!match) {
    const status = input.preflight.status === "blocked" ? "blocked" : "cold";
    return {
      goal: input.goal,
      status,
      preflightStatus: input.preflight.status,
      currentTokens,
      stableTokens,
      dynamicTokens,
      profileStableTokens: 0,
      reusableTokens: 0,
      estimatedHitRate: 0,
      reason: "no saved cache profile matched this goal",
      recommendations: forecastRecommendations({
        goal: input.goal,
        status,
        preflight: input.preflight,
      }),
      nextCommands: forecastNextCommands({
        goal: input.goal,
        status,
        preflight: input.preflight,
      }),
    };
  }

  const profileStableTokens = stableTokenEstimate(match.profile.planTokens, match.profile.dynamicShare);
  const overlapFactor = clamp(match.score / 125, 0.15, 1);
  const qualityFactor = forecastQualityFactor(match.profile);
  const riskFactor = forecastRiskFactor(match.profile);
  const recencyFactor = forecastRecencyFactor(match.profile);
  const reusableTokens = Math.round(Math.min(stableTokens, profileStableTokens) * overlapFactor * qualityFactor * riskFactor * recencyFactor);
  const estimatedHitRate = currentTokens > 0 ? reusableTokens / currentTokens : 0;
  const status = forecastStatus(input.preflight, match.profile, estimatedHitRate, match.score);
  return {
    goal: input.goal,
    status,
    preflightStatus: input.preflight.status,
    profile: match.profile,
    match,
    currentTokens,
    stableTokens,
    dynamicTokens,
    profileStableTokens,
    reusableTokens,
    estimatedHitRate,
    reason: `profile=${match.profile.name} score=${match.score} ${match.reason}`,
    recommendations: forecastRecommendations({
      goal: input.goal,
      status,
      preflight: input.preflight,
      match,
    }),
    nextCommands: forecastNextCommands({
      goal: input.goal,
      status,
      preflight: input.preflight,
      match,
    }),
  };
}

export function formatCacheProfileForecast(forecast: CacheProfileForecast): string {
  const lines = [
    `cache profile forecast: ${forecast.status} goal=${forecast.goal}`,
    `preflight=${forecast.preflightStatus} profile=${forecast.profile?.name ?? "none"}${forecast.match ? ` score=${forecast.match.score}` : ""}`,
    `tokens current~${forecast.currentTokens} stable~${forecast.stableTokens} dynamic~${forecast.dynamicTokens}`,
    `profileStable~${forecast.profileStableTokens} reusable~${forecast.reusableTokens} estimatedHit=${Math.round(forecast.estimatedHitRate * 100)}%`,
    `reason=${forecast.reason}`,
    "recommendations:",
    ...forecast.recommendations.map((item) => `- ${item}`),
    "next commands:",
    ...forecast.nextCommands.map((command) => `- ${command}`),
  ];
  return lines.join("\n");
}

export function normalizeCacheProfileName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) return null;
  if (normalized.includes("..")) return null;
  return normalized;
}

function normalizeProfile(value: unknown, fallbackName: string): CacheProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<CacheProfile>;
  if (typeof record.goal !== "string" || record.goal.trim().length === 0) return undefined;
  return {
    name: normalizeCacheProfileName(record.name ?? fallbackName) ?? fallbackName,
    goal: record.goal,
    createdAt: stringOrNow(record.createdAt),
    updatedAt: stringOrNow(record.updatedAt),
    effort: record.effort ?? "unknown",
    status: record.status === "ready" || record.status === "blocked" ? record.status : "review",
    readinessScore: numberOrZero(record.readinessScore),
    readinessStatus: record.readinessStatus === "ready" || record.readinessStatus === "review" ? record.readinessStatus : "cold",
    stabilityRisk: record.stabilityRisk === "low" || record.stabilityRisk === "high" ? record.stabilityRisk : "medium",
    dynamicShare: numberOrZero(record.dynamicShare),
    shapeFingerprint: record.shapeFingerprint ?? "unknown",
    shapeRepeat: record.shapeRepeat ?? "repeat=unknown",
    planTokens: numberOrZero(record.planTokens),
    droppedChars: numberOrZero(record.droppedChars),
    pinNames: Array.isArray(record.pinNames) ? record.pinNames.filter((item): item is string => typeof item === "string") : [],
    recommendations: Array.isArray(record.recommendations) ? record.recommendations.filter((item): item is string => typeof item === "string") : [],
    nextCommands: Array.isArray(record.nextCommands) ? record.nextCommands.filter((item): item is string => typeof item === "string") : [],
  };
}

function stringOrNow(value: unknown): string {
  return typeof value === "string" && value ? value : new Date().toISOString();
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function tokenize(value: string): Set<string> {
  return new Set(value
    .toLowerCase()
    .split(/[^a-z0-9_\-\u4e00-\u9fa5]+/u)
    .filter((token) => token.length >= 2)
    .slice(0, 40));
}

function readinessBonus(profile: CacheProfile): number {
  if (profile.status === "ready") return 30;
  if (profile.status === "blocked") return -20;
  return Math.min(24, Math.floor(profile.readinessScore / 4));
}

function pinBonus(profile: CacheProfile): number {
  return Math.min(20, profile.pinNames.length * 5);
}

function recencyBonus(profile: CacheProfile): number {
  const updated = Date.parse(profile.updatedAt);
  if (!Number.isFinite(updated)) return 0;
  const ageDays = (Date.now() - updated) / 86_400_000;
  if (ageDays <= 1) return 10;
  if (ageDays <= 14) return 6;
  if (ageDays <= 60) return 2;
  return 0;
}

function riskPenalty(profile: CacheProfile): number {
  if (profile.stabilityRisk === "high") return 18;
  if (profile.stabilityRisk === "medium") return 6;
  return 0;
}

function reasonForProfileMatch(profile: CacheProfile, overlap: string[]): string {
  const reasons = [];
  if (overlap.length > 0) reasons.push(`matched ${overlap.slice(0, 5).join(",")}`);
  if (profile.pinNames.length > 0) reasons.push(`${profile.pinNames.length} stable pins`);
  reasons.push(`status=${profile.status} score=${profile.readinessScore}`);
  if (profile.stabilityRisk !== "low") reasons.push(`risk=${profile.stabilityRisk}`);
  return reasons.join("; ");
}

function auditProfile(profile: CacheProfile, now: number, staleDays: number): CacheProfileAuditIssue[] {
  const issues: CacheProfileAuditIssue[] = [];
  if (profile.status === "blocked") {
    issues.push(issue(profile, "error", "blocked", "profile was saved from a blocked cache preflight"));
  }
  if (profile.readinessScore < 35) {
    issues.push(issue(profile, "warning", "low-readiness", `readiness score is ${profile.readinessScore}`));
  }
  if (profile.pinNames.length === 0) {
    issues.push(issue(profile, "warning", "no-pins", "profile has no stable cache pins"));
  }
  if (profile.stabilityRisk === "high") {
    issues.push(issue(profile, "warning", "high-risk-shape", "prompt shape has high churn risk"));
  }
  if (profile.dynamicShare >= 0.65) {
    issues.push(issue(profile, "warning", "dynamic-heavy", `dynamic share is ${Math.round(profile.dynamicShare * 100)}%`));
  }
  if (profile.droppedChars > 0) {
    issues.push(issue(profile, "warning", "dropped-context", `profile was saved with droppedChars=${profile.droppedChars}`));
  }
  const updated = Date.parse(profile.updatedAt);
  if (!Number.isFinite(updated)) {
    issues.push(issue(profile, "warning", "unknown-age", "profile updatedAt is invalid"));
  } else if ((now - updated) / 86_400_000 > staleDays) {
    issues.push(issue(profile, "warning", "stale", `profile has not been refreshed in more than ${staleDays} days`));
  }
  return issues;
}

function issue(
  profile: CacheProfile,
  severity: CacheProfileAuditIssue["severity"],
  code: string,
  message: string,
): CacheProfileAuditIssue {
  return {
    profile: profile.name,
    severity,
    code,
    message,
    command: `/cache profile prepare ${profile.name}`,
  };
}

function recommendationForAudit(severity: CacheProfileAuditSeverity, profileCount: number): string {
  if (profileCount === 0) return "No cache profiles are saved yet. Create one with /cache profile save <name> <goal>.";
  if (severity === "error") return "Fix blocked cache profiles before relying on automatic profile reuse.";
  if (severity === "warning") return "Refresh warning profiles with /cache profile prepare <name> or remove stale profiles.";
  return "Cache profiles look reusable; /cache profile auto <goal> can safely prefer them.";
}

function cleanupCandidates(report: CacheProfileAuditReport): CacheProfileCleanupCandidate[] {
  const grouped = new Map<string, CacheProfileAuditIssue[]>();
  for (const issue of report.issues) {
    grouped.set(issue.profile, [...(grouped.get(issue.profile) ?? []), issue]);
  }
  return Array.from(grouped.entries())
    .map(([profile, issues]) => cleanupCandidateFor(profile, issues))
    .filter((candidate): candidate is CacheProfileCleanupCandidate => Boolean(candidate))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.profile.localeCompare(b.profile));
}

function cleanupCandidateFor(
  profile: string,
  issues: CacheProfileAuditIssue[],
): CacheProfileCleanupCandidate | undefined {
  const codes = Array.from(new Set(issues.map((issue) => issue.code))).sort((a, b) => a.localeCompare(b));
  const hasError = issues.some((issue) => issue.severity === "error");
  const staleAndWeak = codes.includes("stale") && (codes.includes("no-pins") || codes.includes("low-readiness"));
  const unknownAge = codes.includes("unknown-age");
  if (!hasError && !staleAndWeak && !unknownAge) return undefined;
  const severity: CacheProfileAuditIssue["severity"] = hasError ? "error" : "warning";
  return {
    profile,
    severity,
    codes,
    reason: cleanupReason(codes, hasError, unknownAge),
    command: `/cache profile remove ${profile}`,
  };
}

function cleanupReason(codes: string[], hasError: boolean, unknownAge: boolean): string {
  if (hasError) return "profile has blocking cache issues and should not be reused automatically";
  if (unknownAge) return "profile timestamp is invalid, so reuse recency cannot be trusted";
  return `profile is stale and weak (${codes.join(",")})`;
}

function severityRank(severity: CacheProfileAuditIssue["severity"]): number {
  return severity === "error" ? 2 : 1;
}

function stableTokenEstimate(planTokens: number, dynamicShare: number): number {
  return Math.max(0, Math.round(Math.max(0, planTokens) * clamp(1 - dynamicShare, 0, 1)));
}

function forecastQualityFactor(profile: CacheProfile): number {
  if (profile.status === "ready") return 1;
  if (profile.status === "blocked") return 0.2;
  return Math.max(0.55, Math.min(0.85, profile.readinessScore / 100));
}

function forecastRiskFactor(profile: CacheProfile): number {
  if (profile.stabilityRisk === "high") return 0.45;
  if (profile.stabilityRisk === "medium") return 0.75;
  return 1;
}

function forecastRecencyFactor(profile: CacheProfile): number {
  const updated = Date.parse(profile.updatedAt);
  if (!Number.isFinite(updated)) return 0.55;
  const ageDays = (Date.now() - updated) / 86_400_000;
  if (ageDays <= 14) return 1;
  if (ageDays <= 60) return 0.85;
  return 0.6;
}

function forecastStatus(
  preflight: CachePreflightReport,
  profile: CacheProfile,
  estimatedHitRate: number,
  score: number,
): CacheProfileForecastStatus {
  if (preflight.status === "blocked" || profile.status === "blocked") return "blocked";
  if (estimatedHitRate >= 0.45 && score >= 70) return "strong";
  if (estimatedHitRate >= 0.2 && score >= 45) return "warming";
  return "cold";
}

function forecastRecommendations(input: {
  goal: string;
  status: CacheProfileForecastStatus;
  preflight: CachePreflightReport;
  match?: CacheProfileMatch;
}): string[] {
  const recommendations: string[] = [];
  if (input.status === "blocked") {
    recommendations.push("Fix blocked cache preflight or profile issues before relying on profile reuse.");
  } else if (!input.match) {
    recommendations.push("No reusable profile matched this goal; run /cache prepare first, then save a profile.");
  } else if (input.status === "strong") {
    recommendations.push("Profile reuse looks strong; run /cache profile auto before the full DeepSeek request.");
  } else if (input.status === "warming") {
    recommendations.push(`Refresh ${input.match.profile.name} with /cache profile prepare before sending a large request.`);
  } else {
    recommendations.push("Cache reuse looks cold; create or refresh stable pins before spending on a long task.");
  }
  if (input.preflight.suggestionCount > 0) {
    recommendations.push("Apply suggested stable pins to raise the reusable prefix estimate.");
  }
  if (input.preflight.dynamicShare >= 0.65) {
    recommendations.push("Reduce dynamic selected context; high dynamic share lowers DeepSeek prefix-cache odds.");
  }
  return Array.from(new Set(recommendations));
}

function forecastNextCommands(input: {
  goal: string;
  status: CacheProfileForecastStatus;
  preflight: CachePreflightReport;
  match?: CacheProfileMatch;
}): string[] {
  const commands: string[] = [];
  if (input.preflight.suggestionCount > 0) {
    commands.push(`/cache pin apply ${input.goal}`);
  }
  if (input.match) {
    commands.push(input.status === "strong"
      ? `/cache profile auto ${input.goal}`
      : `/cache profile prepare ${input.match.profile.name}`);
    commands.push(`/cache profile show ${input.match.profile.name}`);
  } else {
    commands.push(`/cache prepare ${input.goal}`);
    commands.push(`/cache profile save <name> ${input.goal}`);
  }
  commands.push(`/cache preflight ${input.goal}`);
  return Array.from(new Set(commands));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
