import test from "node:test";
import assert from "node:assert/strict";
import { colorSwatch, themeColor } from "./color.js";
import { ratchetModel } from "./Ratchet.js";

test("design-system color aliases expose DeepSeek terminal theme colors", () => {
  assert.equal(themeColor("brand", "deepseek-dark"), "cyan");
  assert.equal(colorSwatch("deepseek-dark").some((entry) => entry.tone === "success"), true);
});

test("design-system ratchet clamps progress", () => {
  assert.equal(ratchetModel(2, 4).cells, "####");
  assert.equal(ratchetModel(-1, 4).cells, "----");
});
