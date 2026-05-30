import test from "node:test";
import assert from "node:assert/strict";
import { tagTabsModel } from "./TagTabs.js";

test("tag tabs include all tab and selected tag", () => {
  const model = tagTabsModel(["frontend", "cache"], {
    selectedIndex: 1,
    availableWidth: 80,
  });

  assert.equal(model.prefix, "tags");
  assert.equal(model.parts.some((part) => part.label === "All"), true);
  assert.equal(model.parts.find((part) => part.id === "frontend")?.selected, true);
  assert.equal(model.hint, "(tab to cycle)");
});

test("tag tabs dedupe tags and clip long names", () => {
  const model = tagTabsModel(["#frontend", "frontend", "very-long-session-tag-name"], {
    selectedIndex: 2,
    availableWidth: 120,
  });

  assert.equal(model.parts.filter((part) => part.id === "frontend").length, 1);
  assert.equal(model.parts.some((part) => part.id === "very-long-session-tag-name"), true);
  assert.match(model.parts.find((part) => part.selected)?.label ?? "", /^#very/);
});

test("tag tabs report hidden counts for narrow widths", () => {
  const model = tagTabsModel(["one", "two", "three", "four", "five"], {
    selectedIndex: 4,
    availableWidth: 30,
  });

  assert.equal(model.parts.some((part) => part.id === "four"), true);
  assert.equal(model.hiddenLeft > 0 || model.hiddenRight > 0, true);
});
