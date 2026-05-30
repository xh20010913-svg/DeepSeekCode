import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheProfilePanelModel } from "./CacheProfilePanel.js";

const profile = {
  name: "frontend",
  goal: "migrate frontend",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:05:00.000Z",
  effort: "low",
  status: "review" as const,
  readinessScore: 64,
  readinessStatus: "review" as const,
  stabilityRisk: "medium" as const,
  dynamicShare: 0.42,
  shapeFingerprint: "shape-frontend",
  shapeRepeat: "repeat=2",
  planTokens: 1400,
  droppedChars: 0,
  pinNames: ["readme", "package"],
  recommendations: ["Keep prefix stable."],
  nextCommands: ["/cache plan migrate frontend", "/cache doctor"],
};

test("cache profile panel summarizes saved reusable prompt shapes", () => {
  const model = buildCacheProfilePanelModel({
    profiles: [profile],
    selected: profile,
    action: "saved",
  });

  assert.equal(model.title, "DeepSeek cache profile saved");
  assert.equal(model.badge, "review");
  assert.equal(model.ratio, 0.64);
  assert.match(model.summary, /pins=2/);
  assert.ok(model.rows.some((row) => row.label === "shape" && row.detail.includes("dynamic=42%")));
  assert.ok(model.rows.some((row) => row.label === "cmd" && row.detail === "/cache doctor"));
  assert.match(model.footer, /cache profile prepare frontend/);
});

test("cache profile panel exposes empty state", () => {
  const model = buildCacheProfilePanelModel({ profiles: [] });
  assert.equal(model.badge, "empty");
  assert.equal(model.rows[0]?.label, "none");
  assert.match(model.footer, /cache profile save/);
});

test("cache profile panel summarizes match candidates", () => {
  const model = buildCacheProfilePanelModel({
    profiles: [profile],
    matches: [{
      profile,
      score: 120,
      reason: "matched frontend,cache; 2 stable pins",
      command: "/cache profile prepare frontend",
    }],
    queryGoal: "frontend cache migration",
    action: "match",
  });

  assert.equal(model.title, "DeepSeek cache profile match");
  assert.match(model.subtitle, /frontend cache migration/);
  assert.match(model.summary, /matches=1/);
  assert.equal(model.rows[0]?.label, "best");
  assert.match(model.rows[0]?.detail ?? "", /score=120/);
  assert.match(model.footer, /cache profile prepare frontend/);
});

test("cache profile panel summarizes audit issues", () => {
  const model = buildCacheProfilePanelModel({
    profiles: [profile],
    action: "audit",
    audit: {
      severity: "warning",
      profileCount: 1,
      healthyCount: 0,
      issueCount: 1,
      recommendation: "Refresh warning profiles.",
      issues: [{
        profile: "frontend",
        severity: "warning",
        code: "no-pins",
        message: "profile has no stable cache pins",
        command: "/cache profile prepare frontend",
      }],
    },
  });

  assert.equal(model.title, "DeepSeek cache profile audit");
  assert.equal(model.badge, "warning");
  assert.equal(model.badgeTone, "warning");
  assert.equal(model.ratio, 0);
  assert.match(model.summary, /issues=1/);
  assert.equal(model.rows[0]?.label, "warning");
  assert.match(model.rows[0]?.detail ?? "", /no-pins/);
});

test("cache profile panel summarizes cleanup candidates", () => {
  const model = buildCacheProfilePanelModel({
    profiles: [profile],
    action: "clean",
    cleanup: {
      apply: false,
      candidateCount: 1,
      removed: [],
      recommendation: "Review candidates.",
      candidates: [{
        profile: "frontend",
        severity: "warning",
        codes: ["stale", "no-pins"],
        reason: "profile is stale and weak",
        command: "/cache profile remove frontend",
      }],
    },
  });

  assert.equal(model.title, "DeepSeek cache profile clean");
  assert.equal(model.badge, "preview");
  assert.equal(model.badgeTone, "warning");
  assert.match(model.summary, /candidates=1/);
  assert.equal(model.rows[0]?.label, "cand");
  assert.match(model.rows[0]?.detail ?? "", /stale/);
});

test("cache profile panel summarizes reuse forecast", () => {
  const model = buildCacheProfilePanelModel({
    profiles: [profile],
    action: "forecast",
    queryGoal: "frontend cache migration",
    forecast: {
      goal: "frontend cache migration",
      status: "warming",
      preflightStatus: "review",
      profile,
      match: {
        profile,
        score: 94,
        reason: "matched frontend,cache; 2 stable pins",
        command: "/cache profile prepare frontend",
      },
      currentTokens: 1600,
      stableTokens: 900,
      dynamicTokens: 700,
      profileStableTokens: 812,
      reusableTokens: 420,
      estimatedHitRate: 0.2625,
      reason: "profile=frontend score=94 matched frontend,cache",
      recommendations: ["Refresh frontend before a large request."],
      nextCommands: ["/cache profile prepare frontend", "/cache preflight frontend cache migration"],
    },
  });

  assert.equal(model.title, "DeepSeek cache profile forecast");
  assert.equal(model.badge, "warming");
  assert.equal(model.badgeTone, "warning");
  assert.match(model.summary, /hit=26%/);
  assert.equal(model.rows[0]?.label, "prof");
  assert.match(model.rows[1]?.detail ?? "", /reusable~420/);
  assert.match(model.footer, /cache profile prepare frontend/);
});
