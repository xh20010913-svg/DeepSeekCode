import test from "node:test";
import assert from "node:assert/strict";
import { fileEditResultModel } from "./FileEditResultBlock.js";

test("file edit result model summarizes write results without a body", () => {
  assert.deepEqual(fileEditResultModel("write_file"), {
    operation: "write",
    change: "file written",
  });
});

test("file edit result model summarizes patch edit counts", () => {
  assert.deepEqual(fileEditResultModel("apply_patch", "3 edits"), {
    operation: "patch",
    change: "3 edits applied",
    edits: 3,
  });
});

test("file edit result model ignores unrelated tools", () => {
  assert.equal(fileEditResultModel("read_file", "240 chars"), null);
});
