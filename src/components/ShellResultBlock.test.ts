import test from "node:test";
import assert from "node:assert/strict";
import { formatShellOutput, parseShellResultMessage } from "./ShellResultBlock.js";

test("shell result parser extracts exit and command output", () => {
  assert.deepEqual(parseShellResultMessage("exit 0\nhello\nworld"), {
    exit: "exit 0",
    output: "hello\nworld",
    timedOut: false,
  });
});

test("shell result parser handles timeout and unknown output", () => {
  assert.deepEqual(parseShellResultMessage("timed out\nstill running"), {
    exit: "timed out",
    output: "still running",
    timedOut: true,
  });
  assert.equal(parseShellResultMessage("plain text"), null);
});

test("shell result formatter clips long command output", () => {
  const lines = Array.from({ length: 4 }, (_, index) => `line ${index + 1}`).join("\n");
  assert.deepEqual(formatShellOutput(lines, 2), [
    "line 1",
    "line 2",
    "... 2 more output lines ...",
  ]);
});
