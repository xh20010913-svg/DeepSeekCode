import test from "node:test";
import assert from "node:assert/strict";
import { parseValidationResultMessage } from "./ValidationResultBlock.js";

test("validation result parser extracts ok checks", () => {
  assert.deepEqual(parseValidationResultMessage("ok: html, 128 bytes, checks: exists, is_file, utf8"), {
    status: "ok",
    kind: "html",
    bytes: 128,
    checks: ["exists", "is_file", "utf8"],
    errors: [],
  });
});

test("validation result parser extracts failed errors", () => {
  assert.deepEqual(
    parseValidationResultMessage("failed: pdf, 20 bytes, errors: missing PDF header; extension does not match pdf"),
    {
      status: "failed",
      kind: "pdf",
      bytes: 20,
      checks: [],
      errors: ["missing PDF header", "extension does not match pdf"],
    },
  );
});

test("validation result parser ignores unrelated text", () => {
  assert.equal(parseValidationResultMessage("No validation gates."), null);
});
