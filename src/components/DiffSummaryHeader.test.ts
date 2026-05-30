import test from "node:test";
import assert from "node:assert/strict";
import { diffSummaryHeaderModel } from "./DiffSummaryHeader.js";

test("diff summary header extracts changed files and hunks", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " unchanged",
    "-old",
    "+new",
    "+extra",
  ].join("\n");

  assert.deepEqual(diffSummaryHeaderModel(diff), {
    added: 2,
    removed: 1,
    hunks: 1,
    files: ["src/a.ts"],
    clippedFiles: 0,
  });
});

test("diff summary header clips long file lists", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "+++ b/a.ts",
    "diff --git a/b.ts b/b.ts",
    "+++ b/b.ts",
    "diff --git a/c.ts b/c.ts",
    "+++ b/c.ts",
  ].join("\n");

  assert.deepEqual(diffSummaryHeaderModel(diff, 2), {
    added: 0,
    removed: 0,
    hunks: 0,
    files: ["a.ts", "b.ts"],
    clippedFiles: 1,
  });
});
