import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_OUTPUT_STYLES,
  normalizeOutputStyleName,
  parseOutputStyleDocument,
  renderOutputStyleDocument,
} from "./index.js";

test("output style documents parse and builtins include DeepSeek defaults", () => {
  assert.equal(normalizeOutputStyleName("Code Review Style!"), "code-review-style");
  assert.equal(BUILTIN_OUTPUT_STYLES.some((style) => style.name === "deepseek"), true);
  const document = renderOutputStyleDocument({
    name: "Brief",
    description: "Brief replies",
  });
  const parsed = parseOutputStyleDocument(document);
  assert.equal(parsed.description, "Brief replies");
  assert.match(parsed.prompt, /DeepSeekCode/);
});
