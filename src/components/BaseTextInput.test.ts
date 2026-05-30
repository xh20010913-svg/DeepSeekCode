import test from "node:test";
import assert from "node:assert/strict";
import { baseTextInputModel } from "./BaseTextInput.js";

test("base text input splits value around the cursor", () => {
  const model = baseTextInputModel({
    value: "hello",
    cursor: 2,
    width: 10,
  });

  assert.equal(model.before, "he");
  assert.equal(model.cursor, "|");
  assert.equal(model.after, "llo");
});

test("base text input keeps final cursor deletes visible", () => {
  const model = baseTextInputModel({
    value: "abc",
    cursor: 3,
    width: 8,
  });

  assert.equal(model.before, "abc");
  assert.equal(model.after, "");
  assert.equal(model.padding.length, 4);
});

test("base text input renders placeholder inside the width budget", () => {
  const model = baseTextInputModel({
    value: "",
    cursor: 0,
    width: 6,
    placeholder: "Ask DeepSeekCode",
  });

  assert.equal(model.cursor, "|");
  assert.equal(model.placeholder, "Ask D");
  assert.equal(model.padding, "");
});

test("base text input shows command argument hint only when useful", () => {
  const model = baseTextInputModel({
    value: "/cache",
    cursor: 6,
    width: 20,
    argumentHint: "<goal>",
  });

  assert.equal(model.argumentHint, " <goal>");
  assert.equal(baseTextInputModel({
    value: "/cache plan",
    cursor: 11,
    width: 20,
    argumentHint: "<goal>",
  }).argumentHint, "");
});
