import test from "node:test";
import assert from "node:assert/strict";
import { fastIconModel, getFastIconString, isFastModel } from "./FastIcon.js";

test("fast icon model marks flash models without unicode glyphs", () => {
  assert.deepEqual(fastIconModel(false), {
    mark: ">>",
    tone: "success",
    label: "fast model",
    cooldown: false,
  });
  assert.equal(getFastIconString(), ">>");
});

test("fast icon detects DeepSeek flash style model names", () => {
  assert.equal(isFastModel("deepseek-v4-flash"), true);
  assert.equal(isFastModel("deepseek-coder"), false);
});
