import test from "node:test";
import assert from "node:assert/strict";
import { getTerminalTheme, terminalThemes } from "../services/theme/themeCatalog.js";
import { themeCurrentPanelModel, themeListPanelModel } from "./ThemePanel.js";

test("theme list panel marks the current theme", () => {
  const current = {
    theme: "cache-green" as const,
    source: "project" as const,
    path: "D:\\project\\.deepseekcode\\theme.json",
    definition: getTerminalTheme("cache-green"),
  };
  const model = themeListPanelModel({ themes: terminalThemes, current });

  assert.equal(model.badge, "cache-green");
  assert.equal(model.rows.find((row) => row.key === "cache-green")?.status, "current");
  assert.equal(model.picker?.options[model.picker.selectedIndex]?.id, "cache-green");
});

test("theme current panel includes config path and swatches", () => {
  const model = themeCurrentPanelModel({
    theme: "deepseek-dark",
    source: "default",
    path: "D:\\project\\.deepseekcode\\theme.json",
    definition: getTerminalTheme("deepseek-dark"),
  }, "current");

  assert.equal(model.rows[0]?.swatches.length, 4);
  assert.equal(model.rows.some((row) => row.key === "path"), true);
});
