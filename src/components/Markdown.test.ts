import test from "node:test";
import assert from "node:assert/strict";
import { parseOrderedListBlock } from "./Markdown.js";

test("markdown parser groups adjacent ordered list rows", () => {
  const block = parseOrderedListBlock([
    "1. inspect reference",
    "2. adapt component",
    "done",
  ], 0);

  assert.deepEqual(block.items, ["inspect reference", "adapt component"]);
  assert.equal(block.endIndex, 1);
});
