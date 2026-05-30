import test from "node:test";
import assert from "node:assert/strict";
import { vimModeModel } from "./VimTextInput.js";

test("vim text input exposes insert mode chrome", () => {
  const model = vimModeModel("insert");

  assert.equal(model.label, "INS");
  assert.equal(model.tone, "success");
  assert.equal(model.acceptsText, true);
  assert.equal(model.cursorVisible, true);
});

test("vim text input exposes normal mode chrome", () => {
  const model = vimModeModel("normal");

  assert.equal(model.label, "NOR");
  assert.equal(model.tone, "warning");
  assert.equal(model.acceptsText, false);
});
