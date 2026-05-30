import test from "node:test";
import assert from "node:assert/strict";
import { searchBoxModel } from "./SearchBox.js";

test("search box model shows focused terminal cursor in query", () => {
  const model = searchBoxModel({
    query: "cache",
    isFocused: true,
    isTerminalFocused: true,
    cursorOffset: 2,
  });

  assert.equal(model.beforeCursor, "ca");
  assert.equal(model.cursor, "c");
  assert.equal(model.afterCursor, "he");
  assert.equal(model.showingPlaceholder, false);
});

test("search box model inverts first placeholder cell when empty", () => {
  const model = searchBoxModel({
    query: "",
    placeholder: "Find file",
    isFocused: true,
    isTerminalFocused: true,
    prefix: "@",
  });

  assert.equal(model.prefix, "@");
  assert.equal(model.beforeCursor, "");
  assert.equal(model.cursor, "F");
  assert.equal(model.afterCursor, "ind file");
  assert.equal(model.showingPlaceholder, true);
});

test("search box model clamps cursor offsets", () => {
  assert.equal(searchBoxModel({
    query: "abc",
    isFocused: true,
    isTerminalFocused: true,
    cursorOffset: 99,
  }).cursor, " ");
  assert.equal(searchBoxModel({
    query: "abc",
    isFocused: true,
    isTerminalFocused: true,
    cursorOffset: -1,
  }).cursor, "a");
});
