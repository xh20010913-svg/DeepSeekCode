import test from "node:test";
import assert from "node:assert/strict";
import { buildCachePreparePanelModel } from "./CachePreparePanel.js";

test("cache prepare panel combines pin apply results with preflight status", () => {
  const model = buildCachePreparePanelModel({
    applied: {
      goal: "migrate frontend",
      limit: 4,
      created: [{
        name: "readme",
        path: "D:/project/.deepseekcode/cache-pins/readme.md",
        sourcePath: "README.md",
        chars: 500,
        alreadyPinned: false,
      }],
      skipped: [{
        name: "package",
        sourcePath: "package.json",
        score: 95,
        reason: "project identity",
        chars: 300,
        preview: "Source: package.json",
        command: "/cache pin add package ...",
        alreadyPinned: true,
      }],
      errors: [],
    },
    preflight: {
      goal: "migrate frontend",
      effort: "low",
      status: "review",
      planTokens: 1200,
      droppedChars: 0,
      truncatedBlocks: [],
      stabilityRisk: "medium",
      dynamicShare: 0.4,
      shapeFingerprint: "shape-abc",
      shapeRepeat: "repeat=first",
      readinessScore: 58,
      readinessStatus: "review",
      pinSeverity: "ok",
      pinCount: 2,
      pinIssues: 0,
      suggestionCount: 0,
      topSuggestions: [],
      recommendations: ["Run /cache plan <goal>."],
      nextCommands: ["/cache plan migrate frontend", "/cache doctor"],
    },
  });

  assert.equal(model.badge, "prepared");
  assert.equal(model.badgeTone, "success");
  assert.equal(model.ratio, 0.58);
  assert.match(model.summary, /created=1/);
  assert.match(model.summary, /boostChars=500/);
  assert.ok(model.rows.some((row) => row.label === "new" && row.name === "readme"));
  assert.ok(model.rows.some((row) => row.label === "shape" && row.detail.includes("dynamic=40%")));
  assert.ok(model.rows.some((row) => row.label === "cmd" && row.detail === "/cache doctor"));
});

test("cache prepare panel marks pin apply errors as error", () => {
  const model = buildCachePreparePanelModel({
    applied: {
      goal: "ship",
      limit: 4,
      created: [],
      skipped: [],
      errors: [{
        name: "secret",
        sourcePath: "docs/secret.md",
        message: "cache pin source contains a secret",
      }],
    },
    preflight: {
      goal: "ship",
      effort: "medium",
      status: "ready",
      planTokens: 400,
      droppedChars: 0,
      truncatedBlocks: [],
      stabilityRisk: "low",
      dynamicShare: 0.1,
      shapeFingerprint: "shape-ok",
      shapeRepeat: "repeat=2",
      readinessScore: 90,
      readinessStatus: "ready",
      pinSeverity: "ok",
      pinCount: 2,
      pinIssues: 0,
      suggestionCount: 0,
      topSuggestions: [],
      recommendations: ["ready"],
      nextCommands: ["/cache plan ship"],
    },
  });

  assert.equal(model.badge, "pin-error");
  assert.equal(model.badgeTone, "error");
  assert.ok(model.rows.some((row) => row.label === "err"));
});

test("cache prepare panel can surface matched cache profile", () => {
  const model = buildCachePreparePanelModel({
    applied: {
      goal: "frontend cache migration",
      limit: 4,
      created: [],
      skipped: [],
      errors: [],
    },
    preflight: {
      goal: "frontend cache migration",
      effort: "low",
      status: "review",
      planTokens: 600,
      droppedChars: 0,
      truncatedBlocks: [],
      stabilityRisk: "medium",
      dynamicShare: 0.35,
      shapeFingerprint: "shape-match",
      shapeRepeat: "repeat=first",
      readinessScore: 67,
      readinessStatus: "review",
      pinSeverity: "ok",
      pinCount: 2,
      pinIssues: 0,
      suggestionCount: 0,
      topSuggestions: [],
      recommendations: ["review"],
      nextCommands: ["/cache plan frontend cache migration"],
    },
    profileMatch: {
      profile: {
        name: "frontend",
        goal: "migrate frontend",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
        effort: "low",
        status: "review",
        readinessScore: 60,
        readinessStatus: "review",
        stabilityRisk: "medium",
        dynamicShare: 0.4,
        shapeFingerprint: "shape-old",
        shapeRepeat: "repeat=2",
        planTokens: 500,
        droppedChars: 0,
        pinNames: ["readme"],
        recommendations: [],
        nextCommands: [],
      },
      score: 91,
      reason: "matched frontend,cache; 1 stable pins",
      command: "/cache profile prepare frontend",
    },
  });

  assert.equal(model.badge, "matched");
  assert.match(model.summary, /profile=frontend/);
  assert.ok(model.rows.some((row) => row.label === "prof" && row.detail.includes("score=91")));
});
