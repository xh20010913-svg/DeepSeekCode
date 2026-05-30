import test from "node:test";
import assert from "node:assert/strict";
import { fileEditPreviewModel } from "./FileEditPreviewBlock.js";

test("file edit preview model summarizes overwrite approvals", () => {
  assert.deepEqual(fileEditPreviewModel("write_file path=src/index.ts overwrite=true chars=120"), {
    action: "write_file",
    title: "Overwrite file",
    path: "src/index.ts",
    operation: "replace file content",
    impact: "120 chars",
    detail: "",
    change: "",
    fingerprint: "",
    risk: "high",
    hint: "approve, then inspect with /diff git",
  });
});

test("file edit preview model summarizes create approvals", () => {
  assert.deepEqual(fileEditPreviewModel("write_file path=src/new.ts overwrite=false chars=42 lines=3 projected=ok exists=false oldLines=0 newLines=3 added=3 removed=0 sha=abc123"), {
    action: "write_file",
    title: "Create file",
    path: "src/new.ts",
    operation: "write new file",
    impact: "42 chars",
    detail: "3 lines",
    change: "+3 -0 | 0 -> 3 lines | exists false",
    fingerprint: "abc123",
    risk: "medium",
    hint: "approve to create, then inspect with /diff git",
  });
});

test("file edit preview model summarizes patch approvals", () => {
  assert.deepEqual(fileEditPreviewModel("apply_patch path=src/index.ts edits=3 searchChars=90 replaceChars=120 projected=missing_search sha=def456"), {
    action: "apply_patch",
    title: "Apply patch",
    path: "src/index.ts",
    operation: "search/replace edits",
    impact: "3 edits",
    detail: "90 search chars -> 120 replace chars",
    change: "projection missing_search",
    fingerprint: "def456",
    risk: "high",
    hint: "approve, then inspect with /diff git",
  });
});

test("file edit preview model ignores unrelated approvals", () => {
  assert.equal(fileEditPreviewModel("run_command command=npm.cmd test cwd=."), null);
});
