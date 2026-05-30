import test from "node:test";
import assert from "node:assert/strict";
import { clampDialogWidth, formatDialogGuide } from "./Dialog.js";

test("dialog guide keeps shortcut hints terminal-readable", () => {
  assert.equal(formatDialogGuide([
    { shortcut: "Enter", action: "confirm" },
    { shortcut: "Esc", action: "cancel" },
  ]), "Enter to confirm | Esc to cancel");
});

test("dialog width clamps to available terminal columns", () => {
  assert.equal(clampDialogWidth(undefined, 120), 88);
  assert.equal(clampDialogWidth(132, 100), 96);
  assert.equal(clampDialogWidth(20, 80), 40);
});
