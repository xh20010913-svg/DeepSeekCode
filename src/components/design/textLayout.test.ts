import test from "node:test";
import assert from "node:assert/strict";
import {
  flattenCellText,
  padRightCells,
  takeCells,
  truncateCells,
} from "./textLayout.js";
import { cellWidth } from "../../prompt/promptViewport.js";

test("terminal text layout flattens multiline copy", () => {
  assert.equal(flattenCellText("  hello\n\nworld  "), "hello world");
});

test("terminal text layout truncates without splitting wide cells", () => {
  assert.equal(takeCells("你好abc", 3), "你");
  assert.equal(truncateCells("你好世界abc", 7), "你好...");
});

test("terminal text layout pads to terminal cell width", () => {
  const padded = padRightCells("你好", 6);
  assert.equal(cellWidth(padded), 6);
});
