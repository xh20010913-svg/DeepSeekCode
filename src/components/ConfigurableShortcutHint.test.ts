import test from "node:test";
import assert from "node:assert/strict";
import { shortcutDisplay } from "./ConfigurableShortcutHint.js";

test("configurable shortcut hint normalizes fallback shortcuts", () => {
  assert.equal(shortcutDisplay("ctrl+o"), "Ctrl+O");
  assert.equal(shortcutDisplay("@file"), "@file");
});
