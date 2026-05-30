import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ThemeService } from "./themeService.js";

test("ThemeService persists project themes and supports reset", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-theme-"));
  const previous = process.env.DEEPSEEKCODE_THEME;
  delete process.env.DEEPSEEKCODE_THEME;
  const service = new ThemeService(projectPath);

  assert.equal(service.current().theme, "deepseek-dark");
  const set = service.set("cache-green");
  assert.equal(set.theme, "cache-green");
  assert.equal(process.env.DEEPSEEKCODE_THEME, "cache-green");
  assert.match(fs.readFileSync(service.path(), "utf8"), /cache-green/);
  const reset = service.reset();
  assert.equal(reset.theme, "deepseek-dark");
  assert.equal(fs.existsSync(service.path()), false);

  if (previous === undefined) delete process.env.DEEPSEEKCODE_THEME;
  else process.env.DEEPSEEKCODE_THEME = previous;
});

test("ThemeService lets environment override project settings", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-theme-"));
  const previous = process.env.DEEPSEEKCODE_THEME;
  const service = new ThemeService(projectPath);
  service.set("cache-green");
  process.env.DEEPSEEKCODE_THEME = "high-contrast";

  const current = service.current();
  assert.equal(current.theme, "high-contrast");
  assert.equal(current.source, "env");

  if (previous === undefined) delete process.env.DEEPSEEKCODE_THEME;
  else process.env.DEEPSEEKCODE_THEME = previous;
});
