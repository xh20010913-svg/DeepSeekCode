import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHookId,
  parseHooksConfig,
  renderHooksConfig,
  validateHooksConfig,
} from "./config.js";

test("hook config normalizes, renders, and validates local hook definitions", () => {
  assert.equal(normalizeHookId("Pre Read Hook!"), "pre-read-hook");
  const document = renderHooksConfig({
    hooks: [{
      id: "pre-read-hook",
      event: "PreToolUse",
      matcher: "read_file",
      command: "node -p 42",
      enabled: true,
      timeout_ms: 1000,
    }],
  });
  const config = parseHooksConfig(JSON.parse(document));
  assert.equal(config.hooks[0]?.event, "PreToolUse");
  assert.equal(validateHooksConfig("hooks.json", document).ok, true);

  const weak = validateHooksConfig("hooks.json", JSON.stringify({
    hooks: [{ id: "bad id", event: "PreToolUse", command: "node -p 42" }],
  }));
  assert.equal(weak.ok, false);
  assert.match(weak.errors[0] ?? "", /not a valid/);
});
