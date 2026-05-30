import test from "node:test";
import assert from "node:assert/strict";
import {
  getHistorySearchItems,
  historySearchInsertText,
} from "./historySearch.js";

const entries = [
  "latest prompt about cache",
  "review the current diff",
  "write tests for command palette",
  "multi\nline\nprompt",
];

test("history search keeps newest-first order for empty query", () => {
  assert.deepEqual(
    getHistorySearchItems(entries, "").map((item) => item.firstLine),
    ["latest prompt about cache", "review the current diff", "write tests for command palette", "multi"],
  );
});

test("history search matches exact text before fuzzy matches", () => {
  assert.deepEqual(
    getHistorySearchItems(entries, "diff").map((item) => item.firstLine),
    ["review the current diff"],
  );
  assert.deepEqual(
    getHistorySearchItems(entries, "wts").map((item) => item.firstLine),
    ["write tests for command palette"],
  );
});

test("history search exposes insert text and line metadata", () => {
  const [item] = getHistorySearchItems(entries, "multi");
  assert.ok(item);
  assert.equal(item.lineCount, 3);
  assert.equal(historySearchInsertText(item), "multi\nline\nprompt");
});
