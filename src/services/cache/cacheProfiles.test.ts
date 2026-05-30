import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CacheProfileService,
  auditCacheProfiles,
  buildCacheProfileCleanupPlan,
  buildCacheProfileForecast,
  formatCacheProfileAudit,
  formatCacheProfileCleanup,
  formatCacheProfileForecast,
  formatCacheProfile,
  formatCacheProfileList,
  formatCacheProfileMatches,
  matchCacheProfiles,
} from "./cacheProfiles.js";

function preflight(goal = "migrate frontend") {
  return {
    goal,
    effort: "low",
    status: "review" as const,
    planTokens: 900,
    droppedChars: 0,
    truncatedBlocks: [],
    stabilityRisk: "medium" as const,
    dynamicShare: 0.4,
    shapeFingerprint: "shape-123",
    shapeRepeat: "repeat=first",
    readinessScore: 62,
    readinessStatus: "review" as const,
    pinSeverity: "ok" as const,
    pinCount: 2,
    pinIssues: 0,
    suggestionCount: 0,
    topSuggestions: [],
    recommendations: ["Apply stable pins."],
    nextCommands: ["/cache plan migrate frontend"],
  };
}

test("cache profile service saves lists loads and removes profiles", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-profile-"));
  const service = new CacheProfileService(projectPath);

  const saved = service.saveFromPreflight({
    name: "frontend",
    preflight: preflight(),
    pinNames: ["readme", "package", "readme"],
  });

  assert.equal(saved.name, "frontend");
  assert.deepEqual(saved.pinNames, ["package", "readme"]);
  assert.match(service.path("frontend"), /frontend\.json$/);
  assert.equal(service.list().length, 1);
  assert.equal(service.load("frontend")?.shapeFingerprint, "shape-123");
  assert.match(formatCacheProfile(saved), /cache profile frontend/);
  assert.match(formatCacheProfileList(service.list()), /migrate frontend/);
  assert.equal(service.remove("frontend"), true);
  assert.equal(service.list().length, 0);
});

test("cache profile service rejects unsafe names", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-profile-"));
  const service = new CacheProfileService(projectPath);
  assert.throws(() => service.saveFromPreflight({
    name: "../bad",
    preflight: preflight(),
    pinNames: [],
  }), /cache profile name/);
  assert.match(formatCacheProfileList([]), /No cache profiles/);
});

test("cache profile matching ranks reusable goals and formats commands", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-profile-"));
  const service = new CacheProfileService(projectPath);
  service.saveFromPreflight({
    name: "frontend",
    preflight: preflight("migrate frontend cache ui"),
    pinNames: ["readme", "package"],
  });
  service.saveFromPreflight({
    name: "ssh",
    preflight: preflight("remote ssh worker transport"),
    pinNames: ["ssh-docs"],
  });

  const matches = matchCacheProfiles(service.list(), "frontend ui cache migration", 2);
  assert.equal(matches[0]?.profile.name, "frontend");
  assert.ok((matches[0]?.score ?? 0) > (matches[1]?.score ?? 0));
  assert.match(matches[0]?.reason ?? "", /matched/);
  assert.match(matches[0]?.command ?? "", /cache profile prepare frontend/);
  assert.match(formatCacheProfileMatches("frontend ui cache migration", matches), /1\. frontend/);
  assert.match(formatCacheProfileMatches("missing", []), /No cache profile match/);

  const forecast = buildCacheProfileForecast({
    goal: "frontend ui cache migration",
    preflight: preflight("frontend ui cache migration"),
    matches,
  });
  assert.equal(forecast.profile?.name, "frontend");
  assert.equal(forecast.status, "warming");
  assert.ok(forecast.reusableTokens > 0);
  assert.match(formatCacheProfileForecast(forecast), /cache profile forecast: warming/);
  assert.match(formatCacheProfileForecast(buildCacheProfileForecast({
    goal: "missing",
    preflight: preflight("missing"),
    matches: [],
  })), /profile=none/);
});

test("cache profile audit reports stale risky and blocked profiles", () => {
  const profiles = [{
    ...new CacheProfileService(fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-profile-"))).saveFromPreflight({
      name: "frontend",
      preflight: preflight("migrate frontend cache ui"),
      pinNames: ["readme"],
    }),
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "blocked" as const,
    readinessScore: 20,
    stabilityRisk: "high" as const,
    dynamicShare: 0.8,
    droppedChars: 25,
    pinNames: [],
  }];

  const report = auditCacheProfiles(profiles, {
    now: new Date("2026-03-15T00:00:00.000Z"),
    staleDays: 30,
  });

  assert.equal(report.severity, "error");
  assert.equal(report.profileCount, 1);
  assert.equal(report.healthyCount, 0);
  assert.match(report.issues.map((issue) => issue.code).join(","), /blocked/);
  assert.match(report.issues.map((issue) => issue.code).join(","), /stale/);
  assert.match(formatCacheProfileAudit(report), /cache profile audit: severity=error/);
  assert.match(formatCacheProfileAudit(auditCacheProfiles([], { now: new Date("2026-03-15T00:00:00.000Z") })), /No cache profiles/);

  const cleanup = buildCacheProfileCleanupPlan(report);
  assert.equal(cleanup.apply, false);
  assert.equal(cleanup.candidateCount, 1);
  assert.equal(cleanup.candidates[0]?.profile, "frontend");
  assert.match(cleanup.candidates[0]?.reason ?? "", /blocking|stale/);
  assert.match(formatCacheProfileCleanup(cleanup), /mode=preview/);
  assert.match(formatCacheProfileCleanup(buildCacheProfileCleanupPlan(report, {
    apply: true,
    removed: ["frontend"],
  })), /removed=1/);
});
