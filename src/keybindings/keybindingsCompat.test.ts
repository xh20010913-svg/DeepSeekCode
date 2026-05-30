import test from "node:test";
import assert from "node:assert/strict";
import { parseShortcut } from "./parser.js";
import { formatShortcut } from "./shortcutFormat.js";
import { matchShortcut } from "./match.js";
import { getBindingDisplayText } from "./resolver.js";
import { validateKeybindings } from "./validate.js";

test("keybinding parser supports multi-chord shortcuts", () => {
  const parsed = parseShortcut("ctrl+x ctrl+k");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.ctrl, true);
  assert.equal(parsed[0]?.key, "x");
  assert.equal(formatShortcut("ctrl+x ctrl+k"), "Ctrl+X Ctrl+K");
});

test("keybinding matcher compares modifier state explicitly", () => {
  const parsed = parseShortcut("ctrl+o");
  assert.equal(matchShortcut(parsed, [{ name: "o", ctrl: true }]), true);
  assert.equal(matchShortcut(parsed, [{ name: "o" }]), false);
});

test("keybinding resolver checks global bindings for local contexts", () => {
  const display = getBindingDisplayText("app:quickOpen", "Chat", [
    { context: "Global", bindings: { "ctrl+o": "app:quickOpen" } },
  ]);
  assert.equal(display, "Ctrl+O");
});

test("keybinding validator reports reserved and duplicate shortcuts", () => {
  const messages = validateKeybindings([
    { context: "Chat", bindings: { "ctrl+c": "custom:copy", "ctrl+o": "one", "CTRL+O": "two" } },
  ]);
  assert.equal(messages.some((message) => message.severity === "error"), true);
  assert.equal(messages.some((message) => message.severity === "warning"), true);
});
