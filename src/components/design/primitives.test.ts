import test from "node:test";
import assert from "node:assert/strict";
import { joinBylineItems } from "./Byline.js";
import { formatKeyboardShortcutHint } from "./KeyboardShortcutHint.js";
import { buildListItemModel } from "./ListItem.js";
import { loadingStateLabel } from "./LoadingState.js";
import { buildProgressBarParts, clampRatio } from "./ProgressBar.js";
import { statusIconModel } from "./StatusIcon.js";

test("progress bar clamps ratios and builds stable ascii cells", () => {
  assert.equal(clampRatio(-1), 0);
  assert.equal(clampRatio(2), 1);
  assert.deepEqual(buildProgressBarParts(0.625, 8), {
    ratio: 0.625,
    filled: "#####",
    empty: "...",
    percent: "63%",
  });
});

test("status icon models use compact terminal-safe labels", () => {
  assert.deepEqual(statusIconModel("success"), { icon: "ok", tone: "success" });
  assert.deepEqual(statusIconModel("warning"), { icon: "!", tone: "warning" });
  assert.deepEqual(statusIconModel("loading"), { icon: "..", tone: "muted" });
});

test("keyboard hints and bylines stay readable in terminal rows", () => {
  assert.equal(formatKeyboardShortcutHint({ shortcut: "Ctrl+P", action: "commands" }), "Ctrl+P to commands");
  assert.equal(formatKeyboardShortcutHint({ shortcut: "Esc", action: "cancel", parens: true }), "(Esc to cancel)");
  assert.equal(joinBylineItems([" Ctrl+P ", "", " /help "]), "Ctrl+P | /help");
});

test("list item model separates focus selection and disabled states", () => {
  assert.deepEqual(buildListItemModel({ focused: true }), {
    indicator: ">",
    marker: "   ",
    tone: "brand",
    dim: false,
  });
  assert.deepEqual(buildListItemModel({ focused: false, selected: true }), {
    indicator: " ",
    marker: "[x]",
    tone: "success",
    dim: false,
  });
  assert.equal(buildListItemModel({ focused: false, disabled: true }).dim, true);
});

test("loading state label compacts optional subtitle", () => {
  assert.equal(loadingStateLabel({ message: "  Indexing  " }), "Indexing");
  assert.equal(loadingStateLabel({ message: "", subtitle: "cache warmup" }), "Working - cache warmup");
});
