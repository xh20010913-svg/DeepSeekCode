import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileEditApprovalPreview } from "../services/approval/fileEditApprovalPreview.js";
import { fileEditReviewPanelModel } from "./FileEditReviewPanel.js";

test("file edit review panel combines approval metadata and stored diff", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-file-review-"));
  writeFileEditApprovalPreview(root, {
    gateId: "approval_1",
    action: "apply_patch",
    relativePath: "src/index.ts",
    diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,2 @@\n-old\n+new\n+extra",
  });

  const model = fileEditReviewPanelModel({
    summary: "apply_patch path=src/index.ts edits=1 searchChars=3 replaceChars=3 projected=ok added=2 removed=1 sha=abc",
    projectPath: root,
    gateId: "approval_1",
    maxLines: 10,
  });

  assert.equal(model?.title, "Apply patch");
  assert.equal(model?.riskTone, "warning");
  assert.equal(model?.diff?.meta, "apply_patch src/index.ts | +2 -1");
  assert.ok(model?.decisionOptions.some((option) => option.detail === "/approval approve approval_1 <reason>"));
});

test("file edit review panel ignores non-file approval summaries", () => {
  assert.equal(fileEditReviewPanelModel({
    summary: "run_command command=npm.cmd run smoke cwd=.",
    gateId: "approval_1",
  }), null);
});
