import test from "node:test";
import assert from "node:assert/strict";
import { createPromptEditorState, updatePromptEditor } from "./promptEditor.js";

test("prompt editor inserts at cursor and supports cursor movement", () => {
  let state = createPromptEditorState("helo", 2);
  state = updatePromptEditor(state, { type: "insert", text: "l" });
  assert.deepEqual(state, { value: "hello", cursor: 3 });
  state = updatePromptEditor(state, { type: "moveEnd" });
  state = updatePromptEditor(state, { type: "insert", text: " world" });
  assert.deepEqual(state, { value: "hello world", cursor: 11 });
  state = updatePromptEditor(state, { type: "moveLeft" });
  assert.equal(state.cursor, 10);
});

test("prompt editor supports shell-like cleanup shortcuts", () => {
  let state = createPromptEditorState("hello brave world", 12);
  state = updatePromptEditor(state, { type: "deleteWordBefore" });
  assert.deepEqual(state, { value: "hello world", cursor: 6 });
  state = updatePromptEditor(state, { type: "clearAfter" });
  assert.deepEqual(state, { value: "hello ", cursor: 6 });
  state = updatePromptEditor(state, { type: "clearBefore" });
  assert.deepEqual(state, { value: "", cursor: 0 });
});

test("prompt editor treats delete at end as backspace for terminal compatibility", () => {
  let state = createPromptEditorState("abc", 3);
  state = updatePromptEditor(state, { type: "delete" });
  assert.deepEqual(state, { value: "ab", cursor: 2 });
  state = createPromptEditorState("abc", 1);
  state = updatePromptEditor(state, { type: "delete" });
  assert.deepEqual(state, { value: "ac", cursor: 1 });
});

test("prompt editor normalizes pasted newlines", () => {
  const state = updatePromptEditor(createPromptEditorState("a"), {
    type: "insert",
    text: "\r\nb",
  });
  assert.deepEqual(state, { value: "a\nb", cursor: 3 });
});
