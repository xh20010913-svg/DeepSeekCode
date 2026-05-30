import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TERMINAL_THEME } from "../../services/theme/themeCatalog.js";
import { getActiveTerminalTheme, setActiveTerminalTheme, toneColor } from "./terminalTheme.js";

test("active terminal theme follows project theme unless env overrides it", () => {
  const previous = process.env.DEEPSEEKCODE_THEME;
  try {
    delete process.env.DEEPSEEKCODE_THEME;
    setActiveTerminalTheme("cache-green");
    assert.equal(getActiveTerminalTheme().name, "cache-green");
    assert.equal(toneColor("brand"), "green");

    process.env.DEEPSEEKCODE_THEME = "claude-classic";
    assert.equal(getActiveTerminalTheme().name, "claude-classic");
    assert.equal(toneColor("brand"), "magenta");
  } finally {
    if (previous === undefined) {
      delete process.env.DEEPSEEKCODE_THEME;
    } else {
      process.env.DEEPSEEKCODE_THEME = previous;
    }
    setActiveTerminalTheme(previous ?? DEFAULT_TERMINAL_THEME);
  }
});
