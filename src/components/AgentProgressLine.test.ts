import test from "node:test";
import assert from "node:assert/strict";
import { agentProgressLineModel } from "./AgentProgressLine.js";

test("agent progress line model formats running agent metadata", () => {
  const model = agentProgressLineModel({
    key: "task_1",
    agent: "builder",
    description: "fix the prompt input",
    status: "running",
    index: 0,
    total: 2,
    toolUseCount: 3,
    tokenCount: 12345,
    queuedCount: 2,
    elapsedMs: 65_000,
  });

  assert.equal(model.connector, "|-");
  assert.equal(model.tone, "warning");
  assert.equal(model.selected, true);
  assert.match(model.meta, /1m 5s/);
  assert.match(model.meta, /3 tools/);
  assert.match(model.meta, /12,345 tokens/);
  assert.match(model.meta, /2 queued/);
});

test("agent progress line model marks final failed tasks", () => {
  const model = agentProgressLineModel({
    key: "task_2",
    agent: "tester",
    description: "run checks",
    status: "failed",
    index: 1,
    total: 2,
  });

  assert.equal(model.connector, "`-");
  assert.equal(model.tone, "error");
  assert.equal(model.activity, "needs attention");
});
