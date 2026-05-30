import test from "node:test";
import assert from "node:assert/strict";
import { artifactApprovalPreviewModel } from "./ArtifactApprovalPreviewBlock.js";

test("artifact approval preview summarizes document creation", () => {
  assert.deepEqual(artifactApprovalPreviewModel("create_docx path=reports/summary.docx markdownChars=1200"), {
    action: "create_docx",
    title: "Create DOCX",
    targetLabel: "path",
    target: "reports/summary.docx",
    sizeLabel: "input",
    size: "1200 markdown chars",
    risk: "medium",
    note: "writes a generated document artifact after approval",
  });
});

test("artifact approval preview marks computer use high risk", () => {
  assert.deepEqual(artifactApprovalPreviewModel("computer_use instructionChars=80"), {
    action: "computer_use",
    title: "Computer use",
    targetLabel: "target",
    target: "local desktop automation",
    sizeLabel: "request",
    size: "80 instruction chars",
    risk: "high",
    note: "may control visible desktop state; keep disabled unless explicitly needed",
  });
});

test("artifact approval preview ignores unrelated summaries", () => {
  assert.equal(artifactApprovalPreviewModel("browser_click url=https://example.com selector=#buy"), null);
});
