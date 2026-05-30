import test from "node:test";
import assert from "node:assert/strict";
import { ctrlOToExpand } from "./CtrlOToExpand.js";

test("ctrl o hint reflects DeepSeekCode quick-open behavior", () => {
  assert.equal(ctrlOToExpand(), "(Ctrl+O to quick open)");
});
