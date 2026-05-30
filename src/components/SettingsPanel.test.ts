import test from "node:test";
import assert from "node:assert/strict";
import { settingsPanelModel, normalizeSettingsTab } from "./SettingsPanel.js";
import { getTerminalTheme } from "../services/theme/themeCatalog.js";
import type { ProjectStatusSummary } from "../services/status/projectStatus.js";

function status(overrides: Partial<ProjectStatusSummary> = {}): ProjectStatusSummary {
  return {
    product: "DeepSeekCode",
    projectPath: "D:\\code\\DeepSeekCode",
    dataDir: "D:\\code\\DeepSeekCode\\.deepseekcode",
    model: "deepseek-v4-flash",
    providerReady: true,
    permissionProfile: "safe",
    permissions: { shell: false, browser: false },
    cache: { hitTokens: 900, missTokens: 100, rate: "90%", observedRuns: 2 },
    runs: { totalRecent: 3, unfinished: 0 },
    tasks: { queued: 0, running: 0, succeeded: 1, failed: 0, paused: 0, cancelled: 0 },
    gates: { approvalsPending: 0, validationsPending: 0, validationsFailed: 0 },
    git: {
      available: true,
      clean: true,
      modified: 0,
      added: 0,
      deleted: 0,
      renamed: 0,
      untracked: 0,
      conflicted: 0,
      raw: "",
    },
    ...overrides,
  };
}

const base = {
  outputStyle: {
    name: "deepseek",
    scope: "builtin" as const,
    description: "default style",
    prompt: "",
  },
  inference: {
    effort: "auto" as const,
    actionContextChars: 18_000,
    actionDynamicChars: 24_000,
    sideQuestionContextChars: 12_000,
    sideQuestionDynamicChars: 16_000,
    maxOutputTokens: 1200,
  },
  theme: {
    theme: "deepseek-dark" as const,
    source: "default" as const,
    path: "D:\\code\\DeepSeekCode\\.deepseekcode\\theme.json",
    definition: getTerminalTheme("deepseek-dark"),
  },
};

test("settings panel normalizes known tabs", () => {
  assert.equal(normalizeSettingsTab("CONFIG"), "config");
  assert.equal(normalizeSettingsTab("gate"), "gates");
  assert.equal(normalizeSettingsTab("appearance"), "theme");
  assert.equal(normalizeSettingsTab("unknown"), "status");
});

test("settings panel status tab summarizes cache and actions", () => {
  const model = settingsPanelModel({ ...base, status: status(), tab: "status" });
  assert.equal(model.selectedTab, "status");
  assert.equal(model.cacheRatio, 0.9);
  assert.ok(model.rows.some((row) => row.key === "provider" && row.status === "ready"));
  assert.ok(model.actions.some((action) => action.detail === "/cache doctor current"));
});

test("settings panel gates tab highlights pending approvals", () => {
  const model = settingsPanelModel({
    ...base,
    status: status({ gates: { approvalsPending: 2, validationsPending: 1, validationsFailed: 0 } }),
    tab: "gates",
  });
  assert.equal(model.badgeTone, "warning");
  assert.ok(model.rows.some((row) => row.key === "approval" && row.status === "2 pending"));
});

test("settings panel theme tab embeds the theme picker", () => {
  const model = settingsPanelModel({ ...base, status: status(), tab: "theme" });
  assert.equal(model.selectedTab, "theme");
  assert.ok(model.themePicker);
  assert.ok(model.rows.some((row) => row.key === "current" && row.detail === "deepseek-dark"));
  assert.ok(model.actions.some((action) => action.detail === "/theme set cache-green"));
});
