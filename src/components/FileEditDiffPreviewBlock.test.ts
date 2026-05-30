import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileEditApprovalPreview } from "../services/approval/fileEditApprovalPreview.js";
import { fileEditDiffPreviewModel, fileEditDiffPreviewModelFromRecord } from "./FileEditDiffPreviewBlock.js";

test("file edit diff preview model summarizes stored diff records", () => {
  const model = fileEditDiffPreviewModelFromRecord({
    schemaVersion: 1,
    gateId: "approval_1",
    action: "apply_patch",
    relativePath: "src/index.ts",
    status: "ok",
    createdAtMs: 1,
    added: 2,
    removed: 1,
    diffLines: ["--- a/src/index.ts", "+++ b/src/index.ts", "@@ -1,1 +1,2 @@", "-old", "+new", "+extra"],
    clipped: false,
    maxLines: 120,
    maxLineChars: 180,
  }, 4);

  assert.deepEqual(model, {
    status: "ok",
    title: "Diff preview",
    meta: "apply_patch src/index.ts | +2 -1",
    lines: ["--- a/src/index.ts", "+++ b/src/index.ts", "@@ -1,1 +1,2 @@", "-old"],
    clipped: true,
    unavailableReason: "unavailable",
  });
});

test("file edit diff preview model loads project sidecar files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-preview-ui-"));
  writeFileEditApprovalPreview(root, {
    gateId: "approval_1",
    action: "write_file",
    relativePath: "note.txt",
    diff: "--- a/note.txt\n+++ b/note.txt\n@@ -1,0 +1,1 @@\n+hello",
  });

  const model = fileEditDiffPreviewModel(root, "approval_1", 10);
  assert.equal(model?.meta, "write_file note.txt | +1 -0");
  assert.equal(model?.lines.at(-1), "+hello");
});
