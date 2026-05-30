import test from "node:test";
import assert from "node:assert/strict";
import { interruptedByUserPrompt } from "./InterruptedByUser.js";

test("interrupted by user prompt uses DeepSeekCode wording", () => {
  assert.equal(interruptedByUserPrompt(), "What should DeepSeekCode do instead?");
});

test("interrupted by user prompt falls back for blank overrides", () => {
  assert.equal(interruptedByUserPrompt("   "), "What should DeepSeekCode do instead?");
  assert.equal(interruptedByUserPrompt("Try a smaller change"), "Try a smaller change");
});
