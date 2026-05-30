import test from "node:test";
import assert from "node:assert/strict";
import {
  markdownTableModel,
  parseMarkdownTableBlock,
  renderMarkdownTableLines,
} from "./MarkdownTable.js";

test("markdown table parser recognizes header separator and rows", () => {
  const parsed = parseMarkdownTableBlock([
    "| name | status |",
    "| --- | --- |",
    "| cache | warm |",
    "| provider | ready |",
    "after",
  ], 0, 80);

  assert.equal(parsed?.endIndex, 3);
  assert.deepEqual(parsed?.model.headers, ["name", "status"]);
  assert.equal(parsed?.model.rows.length, 2);
});

test("markdown table renderer builds terminal-safe ascii table", () => {
  const model = markdownTableModel(["name", "detail"], [["cache", "prefix hit rate"]], 40);
  const lines = renderMarkdownTableLines(model, 40);

  assert.match(lines[0] ?? "", /^\+/);
  assert.match(lines[1] ?? "", /\| name/);
  assert.equal(lines.every((line) => line.length <= 40), true);
});
