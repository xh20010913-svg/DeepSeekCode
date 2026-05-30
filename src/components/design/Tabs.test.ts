import test from "node:test";
import assert from "node:assert/strict";
import { buildTabStripParts, resolveSelectedTabId } from "./Tabs.js";

test("tabs resolve the selected id and skip disabled choices", () => {
  const tabs = [
    { id: "files", title: "files", disabled: true },
    { id: "tools", title: "tools" },
  ];
  assert.equal(resolveSelectedTabId(tabs, undefined), "tools");
  assert.equal(resolveSelectedTabId(tabs, "files"), "tools");
  assert.equal(resolveSelectedTabId(tabs, "tools"), "tools");
});

test("tabs build compact selected labels with counts", () => {
  assert.deepEqual(buildTabStripParts([
    { id: "themes", title: "themes", count: 4 },
    { id: "settings", title: "settings" },
  ], "themes"), [
    { id: "themes", label: "themes 4", selected: true, disabled: false, tone: "brand" },
    { id: "settings", label: "settings", selected: false, disabled: false, tone: "muted" },
  ]);
});
