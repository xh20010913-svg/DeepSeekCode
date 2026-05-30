import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackToolUseErrorModel,
  isFallbackToolUseErrorText,
} from "./FallbackToolUseErrorMessage.js";

test("fallback tool use error extracts tagged provider errors", () => {
  const model = fallbackToolUseErrorModel("<tool_use_error><error>boom</error></tool_use_error>");

  assert.equal(model.body, "Error: boom");
  assert.equal(model.hiddenLines, 0);
  assert.equal(isFallbackToolUseErrorText("<tool_use_error>bad</tool_use_error>"), true);
});

test("fallback tool use error hides validation noise unless verbose", () => {
  assert.equal(
    fallbackToolUseErrorModel("InputValidationError: missing field", false).body,
    "Invalid tool parameters",
  );
  assert.equal(
    fallbackToolUseErrorModel("InputValidationError: missing field", true).body,
    "Error: InputValidationError: missing field",
  );
});

test("fallback tool use error clips long output", () => {
  const text = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
  const model = fallbackToolUseErrorModel(text, false, 10);

  assert.equal(model.body.split("\n").length, 10);
  assert.equal(model.hiddenLines, 2);
});
