import test from "node:test";
import assert from "node:assert/strict";
import {
  isSelectableUserRecord,
  messageSelectorModel,
} from "./MessageSelector.js";

const now = Date.now();

const records = [
  { id: "sys_1", role: "system" as const, text: "ready", createdAtMs: now },
  { id: "user_1", role: "user" as const, text: "first request", createdAtMs: now },
  { id: "assistant_1", role: "assistant" as const, text: "first answer", createdAtMs: now },
  { id: "user_2", role: "user" as const, text: "second request\nwith detail", createdAtMs: now },
  { id: "tool_1", role: "tool" as const, text: "tool result", createdAtMs: now },
  { id: "user_3", role: "user" as const, text: "third request", createdAtMs: now },
];

test("message selector keeps selectable user turns and selects newest by default", () => {
  const model = messageSelectorModel(records);

  assert.equal(model.rows.length, 3);
  assert.equal(model.rows[2]?.key, "user_3");
  assert.equal(model.rows[2]?.selected, true);
  assert.equal(model.rows[2]?.label, "target");
  assert.match(model.summary, /3 selectable/);
});

test("message selector centers selected turns inside the visible window", () => {
  const model = messageSelectorModel(records, {
    selectedId: "user_2",
    visibleCount: 1,
  });

  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0]?.key, "user_2");
  assert.equal(model.rows[0]?.text, "second request");
  assert.match(model.summary, /hidden 1 older \/ 1 newer/);
});

test("message selector ignores blank and non-user records", () => {
  assert.equal(isSelectableUserRecord({
    id: "blank",
    role: "user",
    text: "   ",
    createdAtMs: now,
  }), false);
  assert.equal(isSelectableUserRecord(records[2]!), false);
});
