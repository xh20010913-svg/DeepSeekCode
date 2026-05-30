import test from "node:test";
import assert from "node:assert/strict";
import { getFileSuggestions, getUnifiedSuggestions, renderPlaceholder } from "./compat.js";

test("hook compat file suggestions filter by mention text", () => {
  const suggestions = getFileSuggestions("@src", ["src/index.ts", "docs/readme.md"]);
  assert.deepEqual(suggestions.map((item) => item.label), ["src/index.ts"]);
});

test("hook compat unified suggestions separate commands and files", () => {
  assert.equal(getUnifiedSuggestions({ query: "/ca", commands: ["cache", "doctor"] })[0]?.insertText, "/cache ");
  assert.equal(getUnifiedSuggestions({ query: "@doc", files: ["docs/a.md"] })[0]?.insertText, "@docs/a.md");
});

test("hook compat placeholder only renders when input is empty", () => {
  assert.equal(renderPlaceholder("", "ask"), "ask");
  assert.equal(renderPlaceholder("hello", "ask"), "hello");
});
