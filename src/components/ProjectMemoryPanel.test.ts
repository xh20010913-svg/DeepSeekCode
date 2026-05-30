import test from "node:test";
import assert from "node:assert/strict";
import { projectMemoryPanelModel } from "./ProjectMemoryPanel.js";

test("project memory panel keeps non-empty memory lines", () => {
  const model = projectMemoryPanelModel("First fact\n\nSecond fact\n", "D:\\project\\.deepseekcode\\memory.md");

  assert.equal(model.lines.length, 2);
  assert.equal(model.lines[1], "Second fact");
});

test("project memory panel handles empty memory", () => {
  const model = projectMemoryPanelModel("", "D:\\project\\.deepseekcode\\memory.md");

  assert.equal(model.lines.length, 0);
});
