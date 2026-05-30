import test from "node:test";
import assert from "node:assert/strict";
import { spinnerFrame, spinnerLabel, spinnerModel } from "./Spinner.js";

test("spinner frame cycles through terminal-safe ascii frames", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(spinnerFrame), ["-", "\\", "|", "/", "-"]);
});

test("spinner model labels active working state", () => {
  const model = spinnerModel("working", { frameIndex: 2, detail: "queue 1" });

  assert.equal(model.active, true);
  assert.equal(model.frame, "|");
  assert.equal(model.label, "working queue 1");
  assert.equal(model.tone, "success");
});

test("spinner label clips long detail to cell width", () => {
  assert.equal(spinnerLabel("tool", undefined, "writing a very long file", 14), "running too...");
});
