import test from "node:test";
import assert from "node:assert/strict";
import {
  isBackspaceInput,
  isDeleteInput,
  isPrintableInput,
  keypressDeleteAction,
  rawDeleteAction,
} from "./inputKeys.js";

test("input key helpers recognize Windows backspace variants", () => {
  assert.equal(isBackspaceInput(undefined, { backspace: true }), true);
  assert.equal(isBackspaceInput(undefined, { name: "backspace" }), true);
  assert.equal(isBackspaceInput(undefined, { sequence: "\x7f" }), true);
  assert.equal(isBackspaceInput("\b", {}), true);
  assert.equal(isBackspaceInput("\x7f", {}), true);
  assert.equal(isBackspaceInput("h", { ctrl: true }), true);
});

test("input key helpers recognize delete and printable text", () => {
  assert.equal(isDeleteInput(undefined, { delete: true }), true);
  assert.equal(isDeleteInput(undefined, { name: "delete" }), true);
  assert.equal(isDeleteInput(undefined, { sequence: "\x1b[3~" }), true);
  assert.equal(isDeleteInput("\x1b[3~", {}), true);
  assert.equal(isPrintableInput("a", {}), true);
  assert.equal(isPrintableInput("你", {}), true);
  assert.equal(isPrintableInput("\b", {}), false);
  assert.equal(isPrintableInput("p", { ctrl: true }), false);
});

test("raw delete action recognizes stdin control sequences", () => {
  assert.equal(rawDeleteAction(Buffer.from("\x7f")), "backspace");
  assert.equal(rawDeleteAction(Buffer.from("\b")), "backspace");
  assert.equal(rawDeleteAction(Buffer.from("\x1b[3~")), "delete");
  assert.equal(rawDeleteAction(Buffer.from("abc")), null);
});

test("keypress delete action recognizes readline key names", () => {
  assert.equal(keypressDeleteAction(undefined, { name: "backspace" }), "backspace");
  assert.equal(keypressDeleteAction(undefined, { name: "delete" }), "delete");
  assert.equal(keypressDeleteAction("\x7f", {}), "backspace");
  assert.equal(keypressDeleteAction("abc", { name: "a" }), null);
});
