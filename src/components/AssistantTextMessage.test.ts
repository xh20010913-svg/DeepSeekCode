import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAssistantText,
  formatAssistantText,
} from "./AssistantTextMessage.js";

test("assistant text classification separates normal, provider, and context states", () => {
  assert.equal(classifyAssistantText("hello"), "normal");
  assert.equal(classifyAssistantText("API Error: rate limited"), "provider-error");
  assert.equal(classifyAssistantText("context limit reached"), "context-limit");
  assert.equal(classifyAssistantText("Interrupted"), "interrupted");
  assert.equal(classifyAssistantText("   "), "empty");
});

test("assistant text formatting trims transport whitespace without flattening markdown", () => {
  assert.equal(formatAssistantText("  one\n\n- two  "), "one\n\n- two");
});
