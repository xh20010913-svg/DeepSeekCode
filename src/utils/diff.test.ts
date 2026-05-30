import test from "node:test";
import assert from "node:assert/strict";
import { createUnifiedDiff, summarizeDiff, truncateDiff } from "./diff.js";

test("createUnifiedDiff summarizes changed lines", () => {
  const diff = createUnifiedDiff("a/file.txt", "one\ntwo\nthree\n", "b/file.txt", "one\n2\nthree\nfour\n");
  assert.match(diff, /--- a\/file\.txt/);
  assert.match(diff, /\+2/);
  assert.match(diff, /-two/);
  const summary = summarizeDiff(diff);
  assert.equal(summary.added, 2);
  assert.equal(summary.removed, 1);
});

test("truncateDiff clips large diff output predictably", () => {
  assert.equal(truncateDiff("small", 20), "small");
  assert.match(truncateDiff("abcdefghijklmnopqrstuvwxyz", 5), /truncated at 5 chars/);
});
