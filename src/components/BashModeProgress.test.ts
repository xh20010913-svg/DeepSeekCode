import test from "node:test";
import assert from "node:assert/strict";
import { bashModeProgressModel } from "./BashModeProgress.js";

test("bash mode progress summarizes running shell output", () => {
  const model = bashModeProgressModel({
    input: " npm test ",
    progress: {
      output: "one\ntwo\nthree",
      elapsedTimeSeconds: 3.8,
      totalLines: 3,
    },
    maxLines: 2,
  });

  assert.equal(model.command, "npm test");
  assert.equal(model.detail, "shell command is still running");
  assert.equal(model.elapsedLabel, "3s");
  assert.equal(model.totalLinesLabel, "3 lines");
  assert.deepEqual(model.outputLines, ["one", "two", "... 1 more output lines ..."]);
});

test("bash mode progress uses full output in verbose mode", () => {
  const model = bashModeProgressModel({
    input: "",
    verbose: true,
    progress: {
      output: "short",
      fullOutput: "long",
    },
  });

  assert.equal(model.command, "(empty shell input)");
  assert.deepEqual(model.outputLines, ["long"]);
});
