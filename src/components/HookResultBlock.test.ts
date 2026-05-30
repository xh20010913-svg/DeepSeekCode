import test from "node:test";
import assert from "node:assert/strict";
import { parseHookResultMessage, parseHookRows } from "./HookResultBlock.js";

test("hook result parser extracts rows and indented notes", () => {
  assert.deepEqual(parseHookRows([
    "succeeded lint exit=0",
    "  stdout: ok",
    "failed format exit=1 timed_out",
    "  stderr: timeout",
  ].join("\n")), [
    {
      status: "succeeded",
      id: "lint",
      exitCode: "0",
      timedOut: false,
      notes: ["stdout: ok"],
    },
    {
      status: "failed",
      id: "format",
      exitCode: "1",
      timedOut: true,
      notes: ["stderr: timeout"],
    },
  ]);
});

test("hook result model reports failure and skipped states", () => {
  const failed = parseHookResultMessage("failed preflight exit=1\n  stderr: no");
  assert.equal(failed?.tone, "error");
  assert.equal(failed?.state, "error");
  assert.equal(failed?.title, "hooks 1 (failed 1)");

  const skipped = parseHookResultMessage("skipped shell exit=-\n  shell execution is disabled");
  assert.equal(skipped?.tone, "warning");
  assert.equal(skipped?.state, "warning");
  assert.equal(skipped?.title, "hooks 1 (skipped 1)");
});

test("hook result parser ignores unrelated system text", () => {
  assert.equal(parseHookResultMessage("No hooks configured."), null);
});
