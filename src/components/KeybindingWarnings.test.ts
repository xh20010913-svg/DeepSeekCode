import test from "node:test";
import assert from "node:assert/strict";
import { keybindingWarningsModel } from "./KeybindingWarnings.js";

test("keybinding warnings model groups errors before display", () => {
  const model = keybindingWarningsModel({
    path: "D:\\code\\DeepSeekCode\\.deepseekcode\\keybindings.json",
    warnings: [
      { severity: "warning", message: " Duplicate binding ", suggestion: "Pick another shortcut" },
      { severity: "error", message: "Invalid command" },
    ],
  });

  assert.equal(model.visible, true);
  assert.equal(model.statusLabel, "1 error");
  assert.equal(model.tone, "error");
  assert.equal(model.rows[0]?.label, "Warning");
  assert.equal(model.rows[0]?.suggestion, "Pick another shortcut");
});

test("keybinding warnings model hides when disabled or empty", () => {
  assert.equal(keybindingWarningsModel({
    path: "keybindings.json",
    warnings: [],
  }).visible, false);
  assert.equal(keybindingWarningsModel({
    path: "keybindings.json",
    enabled: false,
    warnings: [{ severity: "warning", message: "ignored" }],
  }).visible, false);
});
