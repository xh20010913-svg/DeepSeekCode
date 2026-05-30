import test from "node:test";
import assert from "node:assert/strict";
import { buildCachePreflightPanelModel } from "./CachePreflightPanel.js";

test("cache preflight panel summarizes plan, shape, pins, and suggestions", () => {
  const model = buildCachePreflightPanelModel({
    goal: "improve cache behavior",
    effort: "low",
    status: "review",
    planTokens: 1200,
    droppedChars: 30,
    truncatedBlocks: ["selected_context"],
    stabilityRisk: "high",
    dynamicShare: 0.7,
    shapeFingerprint: "shape-1",
    shapeRepeat: "repeat=first",
    readinessScore: 55,
    readinessStatus: "review",
    pinSeverity: "warning",
    pinCount: 2,
    pinIssues: 1,
    suggestionCount: 1,
    topSuggestions: [{
      name: "readme",
      sourcePath: "README.md",
      score: 105,
      reason: "stable project facts",
      chars: 120,
      preview: "Source: README.md",
      command: "/cache pin add readme ...",
      alreadyPinned: false,
    }],
    recommendations: ["Run /cache pin apply <goal>."],
    nextCommands: ["/cache pin audit", "/cache pin apply improve cache behavior"],
  });

  assert.equal(model.badge, "review");
  assert.equal(model.ratio, 0.55);
  assert.deepEqual(model.rows.slice(0, 4).map((row) => row.label), ["plan", "shape", "pin", "hint"]);
  assert.match(model.rows[3]?.detail ?? "", /readme:105/);
  assert.ok(model.rows.some((row) => row.label === "cmd" && row.detail === "/cache pin audit"));
  assert.match(model.footer, /cache pin audit/);
});

test("cache preflight panel marks blocked reports as error", () => {
  const model = buildCachePreflightPanelModel({
    goal: "ship feature",
    effort: "medium",
    status: "blocked",
    planTokens: 400,
    droppedChars: 0,
    truncatedBlocks: [],
    stabilityRisk: "low",
    dynamicShare: 0.1,
    shapeFingerprint: "shape-ok",
    shapeRepeat: "repeat=2",
    readinessScore: 90,
    readinessStatus: "ready",
    pinSeverity: "error",
    pinCount: 1,
    pinIssues: 1,
    suggestionCount: 0,
    topSuggestions: [],
    recommendations: ["Fix cache pin audit errors before sending this task to DeepSeek."],
    nextCommands: ["/cache pin audit"],
  });

  assert.equal(model.badge, "blocked");
  assert.equal(model.badgeTone, "error");
  assert.equal(model.rows[2]?.tone, "error");
});
