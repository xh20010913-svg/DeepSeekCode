import test from "node:test";
import assert from "node:assert/strict";
import { diffReviewChromeModel } from "./DiffReviewChrome.js";

test("diff review chrome marks active source and review mode", () => {
  assert.deepEqual(diffReviewChromeModel({
    sources: [
      { label: "Current" },
      { label: "T4", detail: "edit auth.ts" },
    ],
    selectedSourceIndex: 1,
    mode: "review",
  }), {
    sources: [
      { label: "Current", active: false },
      { label: "T4 edit auth.ts", active: true },
    ],
    modes: [
      { label: "list", active: false },
      { label: "detail", active: false },
      { label: "review", active: true },
    ],
    guide: "Left/Right source | Tab mode | Enter detail | Esc close",
  });
});

test("diff review chrome switches guide for detail mode", () => {
  assert.equal(diffReviewChromeModel({ mode: "detail" }).guide, "Esc list | q close | Up/Down hunk");
});

test("diff review chrome clamps selected source", () => {
  const model = diffReviewChromeModel({
    sources: [{ label: "A" }, { label: "B" }],
    selectedSourceIndex: 9,
  });

  assert.deepEqual(model.sources, [
    { label: "A", active: false },
    { label: "B", active: true },
  ]);
});
