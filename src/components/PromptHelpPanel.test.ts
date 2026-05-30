import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPromptHelpSections,
  splitPromptHelpColumns,
} from "./PromptHelpPanel.js";

test("prompt help sections expose real DeepSeekCode shortcuts", () => {
  const sections = buildPromptHelpSections(false);
  const rows = sections.flatMap((section) => section.rows.map((row) => row.key));
  assert.ok(rows.includes("Ctrl+P"));
  assert.ok(rows.includes("Ctrl+O"));
  assert.ok(rows.includes("Esc Esc"));
  assert.ok(rows.includes("/cache plan"));
  assert.ok(rows.includes("/permissions"));
});

test("prompt help run action reflects busy queue behavior", () => {
  const idleRun = buildPromptHelpSections(false).find((section) => section.title === "Run");
  const busyRun = buildPromptHelpSections(true).find((section) => section.title === "Run");
  assert.equal(idleRun?.rows[0]?.action, "send prompt");
  assert.equal(busyRun?.rows[0]?.action, "queue next prompt while working");
});

test("prompt help columns split sections evenly", () => {
  const sections = buildPromptHelpSections(false);
  const columns = splitPromptHelpColumns(sections);
  assert.equal(columns.length, 2);
  assert.equal(columns[0]?.length, 2);
  assert.equal(columns[1]?.length, 2);
});
