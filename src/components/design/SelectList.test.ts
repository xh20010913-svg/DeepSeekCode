import test from "node:test";
import assert from "node:assert/strict";
import { buildSelectListRows, clampSelectIndex, selectListWindow } from "./SelectList.js";

test("select list clamps focus away from disabled options", () => {
  const options = [
    { id: "a", label: "A", disabled: true },
    { id: "b", label: "B" },
  ];
  assert.equal(clampSelectIndex(options, 0), 1);
  assert.equal(clampSelectIndex(options, 99), 1);
});

test("select list windows rows around the focused item", () => {
  assert.deepEqual(selectListWindow({ count: 10, selectedIndex: 5, visibleCount: 5 }), {
    start: 3,
    end: 8,
  });
});

test("select list rows expose scroll hints and compact markers", () => {
  const rows = buildSelectListRows({
    options: Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      label: `row-${index}`,
      detail: `detail-${index}`,
    })),
    selectedIndex: 3,
    visibleCount: 3,
  });
  assert.deepEqual(rows.map((row) => [row.id, row.indicator, row.marker, row.focused]), [
    ["2", "^", "   ", false],
    ["3", ">", "[x]", true],
    ["4", " ", "   ", false],
  ]);
});
