import test from "node:test";
import assert from "node:assert/strict";
import { diffFileWindow, formatDiffFileStats, parseDiffFileEntries } from "./DiffFileList.js";

test("diff file list parser groups line stats by file", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " unchanged",
    "-old",
    "+new",
    "+extra",
    "diff --git a/src/b.ts b/src/b.ts",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "@@ -1 +1 @@",
    "+added",
  ].join("\n");

  assert.deepEqual(parseDiffFileEntries(diff), [
    {
      path: "src/a.ts",
      added: 2,
      removed: 1,
      hunks: 1,
      isBinary: false,
      isNew: false,
      isDeleted: false,
      isRenamed: false,
    },
    {
      path: "src/b.ts",
      added: 1,
      removed: 0,
      hunks: 1,
      isBinary: false,
      isNew: false,
      isDeleted: false,
      isRenamed: false,
    },
  ]);
});

test("diff file list parser marks new deleted renamed and binary files", () => {
  const diff = [
    "diff --git a/old.ts b/new.ts",
    "similarity index 91%",
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

  const files = parseDiffFileEntries(diff);
  assert.equal(files[0]?.path, "new.ts");
  assert.equal(files[0]?.isRenamed, true);
  assert.equal(files[1]?.isNew, true);
  assert.equal(files[1]?.added, 1);
  assert.equal(files[2]?.isDeleted, true);
  assert.equal(files[2]?.removed, 1);
  assert.equal(files[3]?.isBinary, true);
});

test("diff file window keeps selected file centered where possible", () => {
  const files = Array.from({ length: 8 }, (_, index) => ({
    path: `${index}.ts`,
    added: index,
    removed: 0,
    hunks: 1,
    isBinary: false,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
  }));

  const model = diffFileWindow(files, 4, 5);

  assert.equal(model.startIndex, 2);
  assert.equal(model.endIndex, 7);
  assert.equal(model.above, 2);
  assert.equal(model.below, 1);
  assert.deepEqual(
    model.visible.map((file) => file.path),
    ["2.ts", "3.ts", "4.ts", "5.ts", "6.ts"],
  );
});

test("diff file stat formatter summarizes status and hunks", () => {
  assert.equal(
    formatDiffFileStats({
      path: "src/app.ts",
      added: 2,
      removed: 1,
      hunks: 3,
      isBinary: false,
      isNew: true,
      isDeleted: false,
      isRenamed: false,
    }),
    "+2 | -1 | 3 hunks | new",
  );
});
