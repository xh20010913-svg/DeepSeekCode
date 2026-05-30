import test from "node:test";
import assert from "node:assert/strict";
import { costPanelModel, statsPanelModel, usagePanelModel } from "./MetricsPanel.js";

test("usage panel highlights strong cache reuse", () => {
  const model = usagePanelModel("all", {
    snapshots: 3,
    inputTokens: 1000,
    outputTokens: 200,
    cacheHitTokens: 800,
    cacheMissTokens: 200,
  });

  assert.equal(model.cacheHitTokens, 800);
  assert.equal(model.rows.find((row) => row.key === "cache hit")?.tone, "success");
  assert.equal(model.rows.find((row) => row.key === "cache miss")?.tone, "muted");
});

test("cost panel is explicit when pricing is unconfigured", () => {
  const model = costPanelModel("all", {
    usage: {
      snapshots: 0,
      inputTokens: 100,
      outputTokens: 50,
      cacheHitTokens: 0,
      cacheMissTokens: 100,
    },
    price: {
      currency: "USD",
    },
    configured: false,
  });

  assert.equal(model.rows[0]?.value, "unconfigured");
  assert.equal(model.rows[0]?.tone, "warning");
});

test("stats panel summarizes runs tasks sessions and cache", () => {
  const model = statsPanelModel({
    runs: {
      totalRecent: 4,
      running: 1,
      succeeded: 2,
      failed: 1,
      paused: 0,
      cancelled: 0,
    },
    tasks: {
      queued: 1,
      running: 0,
      succeeded: 3,
      failed: 0,
      paused: 0,
      cancelled: 0,
    },
    sessions: 2,
    usage: {
      snapshots: 2,
      inputTokens: 1000,
      outputTokens: 100,
      cacheHitTokens: 500,
      cacheMissTokens: 500,
      cacheRate: "50%",
    },
  });

  assert.match(model.subtitle, /4 recent runs/);
  assert.equal(model.rows.find((row) => row.key === "runs")?.tone, "warning");
  assert.equal(model.rows.find((row) => row.key === "cache")?.tone, "warning");
});
