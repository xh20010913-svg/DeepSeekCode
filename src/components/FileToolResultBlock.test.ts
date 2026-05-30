import test from "node:test";
import assert from "node:assert/strict";
import { parseFileToolResultMessage } from "./FileToolResultBlock.js";

test("file tool parser extracts simple read and write metrics", () => {
  assert.deepEqual(parseFileToolResultMessage("read_file", "240 chars"), {
    metricLabel: "chars",
    metricValue: "240",
    lines: [],
  });
  assert.deepEqual(parseFileToolResultMessage("apply_patch", "3 edits"), {
    metricLabel: "edits",
    metricValue: "3",
    lines: [],
  });
});

test("file tool parser summarizes search result lines", () => {
  assert.deepEqual(parseFileToolResultMessage("grep_files", "src/a.ts:1: alpha\nsrc/b.ts:2: beta"), {
    metricLabel: "matches",
    metricValue: "2",
    lines: ["src/a.ts:1: alpha", "src/b.ts:2: beta"],
  });
  assert.deepEqual(parseFileToolResultMessage("glob_files", "no matches"), {
    metricLabel: "matches",
    metricValue: "0",
    lines: [],
  });
});

test("file tool parser ignores non-file actions", () => {
  assert.equal(parseFileToolResultMessage("run_command", "exit 0"), null);
});
