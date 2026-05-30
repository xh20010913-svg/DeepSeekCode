import test from "node:test";
import assert from "node:assert/strict";
import {
  cellWidth,
  createPromptViewport,
  createPromptViewportDisplay,
} from "./promptViewport.js";

test("prompt viewport keeps short input fully visible with cursor split", () => {
  assert.deepEqual(createPromptViewport("nihao world", 5, 40), {
    before: "nihao",
    after: " world",
    prefixHidden: false,
    suffixHidden: false,
  });
});

test("prompt viewport follows the cursor instead of freezing at the first chars", () => {
  const viewport = createPromptViewport("abcdefghijklmnopqrstuvwxyz", 20, 10);
  assert.equal(viewport.before.endsWith("t"), true);
  assert.equal(viewport.after.startsWith("u"), true);
  assert.equal(viewport.prefixHidden, true);
  assert.equal(viewport.suffixHidden, true);
});

test("prompt viewport handles cursor at end of long input", () => {
  const viewport = createPromptViewport("abcdefghijklmnopqrstuvwxyz", 26, 10);
  assert.equal(viewport.before.endsWith("z"), true);
  assert.equal(viewport.after, "");
  assert.equal(viewport.prefixHidden, true);
  assert.equal(viewport.suffixHidden, false);
});

test("prompt viewport display pads shorter rerenders so deleted chars are erased", () => {
  const beforeDelete = createPromptViewportDisplay("abcdef", 6, 12);
  const afterDelete = createPromptViewportDisplay("abcde", 5, 12);
  assert.equal(cellWidth(beforeDelete.before + "|" + beforeDelete.after + beforeDelete.padding), 12);
  assert.equal(cellWidth(afterDelete.before + "|" + afterDelete.after + afterDelete.padding), 12);
  assert.equal(afterDelete.padding.length, beforeDelete.padding.length + 1);
});

test("prompt viewport display accounts for wide CJK characters", () => {
  const display = createPromptViewportDisplay("你好a", 3, 8);
  assert.equal(cellWidth(display.before + "|" + display.after + display.padding), 8);
});
