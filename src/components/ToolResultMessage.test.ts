import test from "node:test";
import assert from "node:assert/strict";
import {
  inferToolResultTone,
  toolResultBody,
  toolResultTitle,
} from "./ToolResultMessage.js";

test("tool result tone inference separates success warning and error states", () => {
  assert.equal(inferToolResultTone("write_file succeeded\nok"), "success");
  assert.equal(inferToolResultTone("Approval required before run_command"), "warning");
  assert.equal(inferToolResultTone("run_command failed\nboom"), "error");
  assert.equal(inferToolResultTone("tool output\nplain body"), "default");
});

test("tool result title and body extraction are stable", () => {
  const text = "run_command succeeded\nline one\nline two";
  assert.equal(toolResultTitle(text), "run_command succeeded");
  assert.equal(toolResultBody(text), "line one\nline two");
  assert.equal(toolResultTitle(""), "tool result");
  assert.equal(toolResultBody("single line"), "");
});
