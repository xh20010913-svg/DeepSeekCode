import test from "node:test";
import assert from "node:assert/strict";
import { normalizeToolReference, toolAdapterInfo, toolTargetName } from "./compat.js";

test("tool adapter normalizes ClaudeCode tool paths", () => {
  assert.equal(normalizeToolReference("BashTool/BashTool.tsx"), "BashTool");
  assert.equal(normalizeToolReference("shared\\foo.ts"), "shared");
});

test("tool adapter maps Claude tool names to DeepSeekCode tool names", () => {
  assert.equal(toolTargetName("BashTool"), "run_command");
  assert.equal(toolTargetName("FileReadTool"), "read_file");
});

test("tool adapter info reports implemented local targets", () => {
  const info = toolAdapterInfo("FileWriteTool/FileWriteTool.ts");
  assert.equal(info.referenceName, "FileWriteTool");
  assert.equal(info.targetName, "write_file");
  assert.equal(info.implemented, true);
});
