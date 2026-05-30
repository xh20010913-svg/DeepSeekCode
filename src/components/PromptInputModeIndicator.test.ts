import test from "node:test";
import assert from "node:assert/strict";
import { promptInputModeIndicatorModel } from "./PromptInputModeIndicator.js";

test("prompt input mode indicator defaults to chat marker", () => {
  assert.deepEqual(promptInputModeIndicatorModel("chat"), {
    marker: ">",
    tone: "brand",
    label: "chat",
  });
});

test("prompt input mode indicator reserves shell and agent markers", () => {
  assert.equal(promptInputModeIndicatorModel("shell").marker, "!");
  assert.equal(promptInputModeIndicatorModel("agent").marker, "@");
});

test("prompt input mode indicator changes tone while busy", () => {
  assert.equal(promptInputModeIndicatorModel("chat", true).tone, "warning");
});
