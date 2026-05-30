import test from "node:test";
import assert from "node:assert/strict";
import {
  logSelectorLevelCounts,
  logSelectorModel,
} from "./LogSelector.js";

const logs = [
  { level: "debug" as const, message: "boot", createdAtMs: 1 },
  { level: "info" as const, message: "started", createdAtMs: 2 },
  { level: "warn" as const, message: "slow hook", metadata: { hook: "pre" }, createdAtMs: 3 },
  { level: "error" as const, message: "tool failed", metadata: { code: 1 }, createdAtMs: 4 },
  { level: "info" as const, message: "recovered", createdAtMs: 5 },
];

test("log selector defaults to the latest warning or error", () => {
  const model = logSelectorModel(logs);

  assert.equal(model.rows.find((row) => row.selected)?.message, "tool failed");
  assert.equal(model.levels.find((level) => level.level === "error")?.count, 1);
  assert.match(model.summary, /5\/5 logs/);
});

test("log selector filters by message and metadata", () => {
  const model = logSelectorModel(logs, { query: "pre" });

  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0]?.level, "warn");
  assert.match(model.rows[0]?.meta ?? "", /"hook":"pre"/);
  assert.match(model.summary, /query="pre"/);
});

test("log selector level counts keep stable severity order", () => {
  assert.deepEqual(logSelectorLevelCounts(logs).map((level) => level.level), [
    "error",
    "warn",
    "info",
    "debug",
  ]);
});
