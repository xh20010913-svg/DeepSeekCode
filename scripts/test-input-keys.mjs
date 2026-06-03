import test from "node:test";
import assert from "node:assert/strict";

import {
  keypressDeleteAction,
  isBackspaceInput,
  isDeleteInput,
} from "../dist/keybindings/inputKeys.js";
import {
  createPromptEditorState,
  updatePromptEditor,
} from "../dist/prompt/promptEditor.js";

test("Backspace at the end removes the previous character", () => {
  const state = createPromptEditorState("abc", 3);
  assert.equal(keypressDeleteAction("\x7f", { sequence: "\x7f" }), "backspace");
  assert.equal(isBackspaceInput("\x7f", { sequence: "\x7f" }), true);
  assert.deepEqual(updatePromptEditor(state, { type: "backspace" }), {
    value: "ab",
    cursor: 2,
  });
});

test("Backspace in the middle removes the character before the cursor", () => {
  const state = createPromptEditorState("abcd", 2);
  assert.equal(keypressDeleteAction("\b", { sequence: "\b" }), "backspace");
  assert.deepEqual(updatePromptEditor(state, { type: "backspace" }), {
    value: "acd",
    cursor: 1,
  });
});

test("Delete removes the character after the cursor", () => {
  const state = createPromptEditorState("abcd", 2);
  assert.equal(keypressDeleteAction("\x1b[3~", { sequence: "\x1b[3~" }), "delete");
  assert.equal(isDeleteInput("\x1b[3~", { sequence: "\x1b[3~" }), true);
  assert.deepEqual(updatePromptEditor(state, { type: "delete" }), {
    value: "abd",
    cursor: 2,
  });
});

test("Ambiguous Windows Terminal delete events are treated as Backspace", () => {
  const expected = process.platform === "win32" ? "backspace" : "delete";
  assert.equal(keypressDeleteAction(undefined, { name: "delete", delete: true }), expected);
});
