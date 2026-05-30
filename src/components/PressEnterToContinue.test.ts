import test from "node:test";
import assert from "node:assert/strict";
import { pressEnterToContinueText } from "./PressEnterToContinue.js";

test("press enter hint has stable copy", () => {
  assert.equal(pressEnterToContinueText(), "Press Enter to continue");
});
