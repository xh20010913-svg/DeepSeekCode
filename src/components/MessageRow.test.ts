import test from "node:test";
import assert from "node:assert/strict";
import { messageRowModel } from "./MessageRow.js";

test("message row model keeps tool rows compact", () => {
  assert.deepEqual(messageRowModel({ isToolLike: true, hasMetadata: false }), {
    marginBottom: 0,
    bodyPaddingLeft: 2,
    showMetadata: false,
  });
});

test("message row model reserves metadata chrome only when needed", () => {
  assert.deepEqual(messageRowModel({ isToolLike: false, hasMetadata: true }), {
    marginBottom: 1,
    bodyPaddingLeft: 2,
    showMetadata: true,
  });
});
