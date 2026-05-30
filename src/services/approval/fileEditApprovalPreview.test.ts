import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fileEditApprovalPreviewPath,
  readFileEditApprovalPreview,
  writeFileEditApprovalPreview,
} from "./fileEditApprovalPreview.js";

test("file edit approval preview writes bounded diff sidecars", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-preview-"));
  const record = writeFileEditApprovalPreview(root, {
    gateId: "approval:test",
    action: "write_file",
    relativePath: "src/index.ts",
    diff: [
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1,1 +1,2 @@",
      "-old",
      "+new",
      "+extra",
    ].join("\n"),
    maxLines: 5,
    maxLineChars: 80,
  });

  assert.equal(record.status, "ok");
  assert.equal(record.added, 2);
  assert.equal(record.removed, 1);
  assert.equal(record.clipped, true);
  assert.equal(fs.existsSync(fileEditApprovalPreviewPath(root, "approval:test")), true);

  const read = readFileEditApprovalPreview(root, "approval:test");
  assert.equal(read?.relativePath, "src/index.ts");
  assert.equal(read?.diffLines.length, 5);
});

test("file edit approval preview records unavailable projections", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-preview-"));
  const record = writeFileEditApprovalPreview(root, {
    gateId: "approval_missing",
    action: "apply_patch",
    relativePath: "src/index.ts",
    unavailableReason: "missing_search",
  });

  assert.equal(record.status, "unavailable");
  assert.equal(record.unavailableReason, "missing_search");
  assert.deepEqual(record.diffLines, []);
  assert.equal(readFileEditApprovalPreview(root, "approval_missing")?.status, "unavailable");
});
