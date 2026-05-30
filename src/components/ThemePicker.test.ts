import test from "node:test";
import assert from "node:assert/strict";
import { getTerminalTheme, terminalThemes } from "../services/theme/themeCatalog.js";
import { themePickerModel } from "./ThemePicker.js";

test("theme picker marks the current project theme", () => {
  const model = themePickerModel({
    themes: terminalThemes,
    current: {
      theme: "cache-green",
      source: "project",
      path: "D:\\project\\.deepseekcode\\theme.json",
      definition: getTerminalTheme("cache-green"),
    },
  });

  assert.equal(model.options[model.selectedIndex]?.id, "cache-green");
  assert.equal(model.options[model.selectedIndex]?.status, "current");
  assert.match(model.footer, /DEEPSEEKCODE_THEME/);
});

test("theme picker keeps cache-first preview copy", () => {
  const model = themePickerModel({
    themes: terminalThemes,
    current: {
      theme: "deepseek-dark",
      source: "default",
      path: "D:\\project\\.deepseekcode\\theme.json",
      definition: getTerminalTheme("deepseek-dark"),
    },
  });

  assert.match(model.preview, /cache plan/);
});
