import test from "node:test";
import assert from "node:assert/strict";
import { diffReviewPanelModel } from "./DiffReviewPanel.js";

test("diff review panel model summarizes diff dialog header data", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    "-old",
    "+new",
    "+extra",
    "diff --git a/src/b.ts b/src/b.ts",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "@@ -1 +1 @@",
    "+added",
  ].join("\n");

  assert.deepEqual(diffReviewPanelModel({
    diff,
    title: "Git diff workspace",
    subtitle: "D:/code/DeepSeekCode",
    sourceLabel: "git diff HEAD",
  }), {
    title: "Git diff workspace",
    subtitle: "D:/code/DeepSeekCode",
    sourceLabel: "git diff HEAD",
    files: 2,
    added: 3,
    removed: 1,
    hunks: 2,
    modeLabel: "review",
    selectedFileIndex: 0,
    selectedFilePath: "src/a.ts",
    emptyMessage: "",
  });
});

test("diff review panel model applies stable defaults", () => {
  assert.deepEqual(diffReviewPanelModel({ diff: "" }), {
    title: "Diff review",
    subtitle: "",
    sourceLabel: "workspace",
    files: 0,
    added: 0,
    removed: 0,
    hunks: 0,
    modeLabel: "review",
    selectedFileIndex: 0,
    selectedFilePath: "",
    emptyMessage: "Working tree is clean",
  });
});

test("diff review panel model tracks mode and selected file", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1 +1 @@",
    "+a",
    "diff --git a/b.ts b/b.ts",
    "--- a/b.ts",
    "+++ b/b.ts",
    "@@ -1 +1 @@",
    "+b",
  ].join("\n");

  const model = diffReviewPanelModel({ diff, mode: "detail", selectedFileIndex: 9 });
  assert.equal(model.modeLabel, "detail");
  assert.equal(model.selectedFileIndex, 1);
  assert.equal(model.selectedFilePath, "b.ts");
});
