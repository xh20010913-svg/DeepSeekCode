import test from "node:test";
import assert from "node:assert/strict";
import { multiSelectOptionsToList } from "./SelectMulti.js";
import { optionLabelText, optionValueKey } from "./option-map.js";
import { selectFocusIndex, selectOptionsToList } from "./select.js";
import { selectNavigationModel } from "./use-select-navigation.js";

const options = [
  { label: "Read only", value: "safe", description: "No shell access" },
  { label: "Shell", value: "shell", description: "Allow commands" },
  { label: "Browser", value: "browser", disabled: true },
];

test("custom select maps options into shared select list rows", () => {
  const rows = selectOptionsToList({
    options,
    selectedValue: "shell",
    focusedValue: "shell",
  });

  assert.equal(rows[1]?.id, "shell");
  assert.equal(rows[1]?.selected, true);
  assert.equal(rows[1]?.detail, "Allow commands");
  assert.equal(rows[2]?.disabled, true);
});

test("custom select chooses the first enabled option when selection is disabled", () => {
  assert.equal(selectFocusIndex({ options, selectedValue: "browser" }), 0);
});

test("custom multi select marks multiple selected values", () => {
  const rows = multiSelectOptionsToList({
    options,
    selectedValues: ["safe", "shell"],
    focusedValue: "safe",
  });

  assert.equal(rows[0]?.selected, true);
  assert.equal(rows[1]?.selected, true);
});

test("custom select navigation builds a centered visible window", () => {
  const model = selectNavigationModel({
    options: Array.from({ length: 10 }, (_, index) => ({
      label: `Option ${index}`,
      value: index,
    })),
    focusedValue: 6,
    visibleOptionCount: 5,
  });

  assert.equal(model.focusedIndex, 7);
  assert.equal(model.visibleFromIndex, 4);
  assert.equal(model.visibleToIndex, 9);
});

test("custom select value and label helpers are stable", () => {
  assert.equal(optionValueKey({ id: 1 }), "{\"id\":1}");
  assert.equal(optionLabelText(["A", " ", 1]), "A 1");
});
