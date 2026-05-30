import test from "node:test";
import assert from "node:assert/strict";
import { clipDiffDetailFiles, diffDetailStatusLabel, parseDiffDetailFiles, selectDiffDetailFiles } from "./DiffDetailView.js";

test("diff detail parser builds hunk lines with old and new line numbers", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -10,3 +10,4 @@",
    " keep",
    "-old",
    "+new",
    "+extra",
  ].join("\n");

  const files = parseDiffDetailFiles(diff);

  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, "src/a.ts");
  assert.equal(files[0]?.added, 2);
  assert.equal(files[0]?.removed, 1);
  assert.equal(files[0]?.hunks[0]?.oldStart, 10);
  assert.equal(files[0]?.hunks[0]?.newStart, 10);
  assert.deepEqual(files[0]?.hunks[0]?.lines, [
    { kind: "context", text: "keep", oldLine: 10, newLine: 10 },
    { kind: "remove", text: "old", oldLine: 11 },
    { kind: "add", text: "new", newLine: 11 },
    { kind: "add", text: "extra", newLine: 12 },
  ]);
});

test("diff detail parser marks file status variants", () => {
  const diff = [
    "diff --git a/old.ts b/new.ts",
    "rename from old.ts",
    "rename to new.ts",
    "diff --git a/new-file.ts b/new-file.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/new-file.ts",
    "@@ -0,0 +1 @@",
    "+hello",
    "diff --git a/deleted.ts b/deleted.ts",
    "deleted file mode 100644",
    "--- a/deleted.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-bye",
    "diff --git a/image.png b/image.png",
    "Binary files a/image.png and b/image.png differ",
  ].join("\n");

  const files = parseDiffDetailFiles(diff);

  assert.equal(files[0]?.path, "new.ts");
  assert.equal(files[0]?.oldPath, "old.ts");
  assert.equal(files[0]?.status, "renamed");
  assert.equal(files[1]?.status, "new");
  assert.equal(files[1]?.added, 1);
  assert.equal(files[2]?.status, "deleted");
  assert.equal(files[2]?.removed, 1);
  assert.equal(files[3]?.status, "binary");
});

test("diff detail clipping preserves file and hunk shells", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,4 +1,4 @@",
    " one",
    " two",
    " three",
    " four",
  ].join("\n");

  const clipped = clipDiffDetailFiles(parseDiffDetailFiles(diff), 3);

  assert.equal(clipped.files[0]?.hunks[0]?.lines.length, 2);
  assert.equal(clipped.clippedLines, 2);
});

test("diff detail status label includes line stats, hunks, and status", () => {
  const [file] = parseDiffDetailFiles([
    "diff --git a/a.ts b/a.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/a.ts",
    "@@ -0,0 +1,2 @@",
    "+one",
    "+two",
  ].join("\n"));

  assert.equal(file ? diffDetailStatusLabel(file) : "", "+2 | -0 | 1 hunk | new");
});

test("diff detail file selection clamps to the selected file", () => {
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

  const files = parseDiffDetailFiles(diff);
  assert.deepEqual(selectDiffDetailFiles(files, 1).map((file) => file.path), ["b.ts"]);
  assert.deepEqual(selectDiffDetailFiles(files, 99).map((file) => file.path), ["b.ts"]);
});
