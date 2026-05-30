import test from "node:test";
import assert from "node:assert/strict";
import { parseActionSummary } from "./ActionSummaryBlock.js";

test("action summary parser extracts file edit fields", () => {
  assert.deepEqual(parseActionSummary("write_file path=src/index.ts overwrite=true chars=120"), {
    action: "write_file",
    fields: [
      { key: "path", value: "src/index.ts" },
      { key: "overwrite", value: "true" },
      { key: "chars", value: "120" },
    ],
  });

  assert.deepEqual(parseActionSummary("apply_patch path=src/index.ts edits=3"), {
    action: "apply_patch",
    fields: [
      { key: "path", value: "src/index.ts" },
      { key: "edits", value: "3" },
    ],
  });
});

test("action summary parser keeps command values with spaces", () => {
  assert.deepEqual(parseActionSummary("run_command command=npm.cmd run smoke cwd=."), {
    action: "run_command",
    fields: [
      { key: "command", value: "npm.cmd run smoke" },
      { key: "cwd", value: "." },
    ],
  });
});

test("action summary parser handles bare actions and unknown text", () => {
  assert.deepEqual(parseActionSummary("computer_use instructionChars=80"), {
    action: "computer_use",
    fields: [{ key: "instructionChars", value: "80" }],
  });
  assert.equal(parseActionSummary("bad/action path=a.ts"), null);
});
