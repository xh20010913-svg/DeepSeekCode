import test from "node:test";
import assert from "node:assert/strict";
import { parseToolResultDetail } from "./ToolResultDetail.js";

test("tool result detail parser extracts action status target and message", () => {
  assert.deepEqual(
    parseToolResultDetail("write_file succeeded src/index.ts", "updated 2 lines"),
    {
      action: "write_file",
      status: "succeeded",
      target: "src/index.ts",
      message: "updated 2 lines",
    },
  );
});

test("tool result detail parser supports command failures", () => {
  assert.deepEqual(parseToolResultDetail("run_command failed npm.cmd test", "exit code 1"), {
    action: "run_command",
    status: "failed",
    target: "npm.cmd test",
    message: "exit code 1",
  });
});

test("tool result detail parser ignores plain transcript text", () => {
  assert.equal(parseToolResultDetail("tool output", "plain body"), null);
  assert.equal(parseToolResultDetail("bad/action succeeded", "body"), null);
});
