import test from "node:test";
import assert from "node:assert/strict";
import {
  formatOrderedListMarker,
  orderedListMarkerWidth,
} from "./OrderedList.js";

test("ordered list markers align double digit lists", () => {
  const width = orderedListMarkerWidth(12);

  assert.equal(width, 2);
  assert.equal(formatOrderedListMarker(1, width), " 1.");
  assert.equal(formatOrderedListMarker(12, width), "12.");
});

test("ordered list marker width stays stable for empty lists", () => {
  assert.equal(orderedListMarkerWidth(0), 1);
  assert.equal(formatOrderedListMarker(0, 0), "1.");
});
