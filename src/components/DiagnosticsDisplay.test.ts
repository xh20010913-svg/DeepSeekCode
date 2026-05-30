import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticsDisplayModel, diagnosticsDisplayOptions } from "./DiagnosticsDisplay.js";

const baseConfig = {
  projectPath: "D:\\code\\DeepSeekCode",
  dataDir: "C:\\Users\\me\\.deepseekcode",
  stateDbPath: "C:\\Users\\me\\.deepseekcode\\state\\deepseekcode.sqlite",
  model: "deepseek-v4-flash",
  provider: null,
  shellEnabled: false,
  browserEnabled: false,
  permissionProfile: "safe" as const,
};

test("diagnostics display model highlights missing provider", () => {
  const model = diagnosticsDisplayModel({
    config: baseConfig,
    providerReady: false,
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
    runs: [],
  });

  assert.equal(model.badge, "1 issue");
  assert.equal(model.badgeTone, "warning");
  assert.equal(model.checks.find((row) => row.id === "provider")?.tone, "error");
  assert.match(model.footer, /cache doctor/);
});

test("diagnostics display options expose actionable rows", () => {
  const model = diagnosticsDisplayModel({
    config: baseConfig,
    providerReady: true,
    providerName: "deepseek-default",
    permissions: { allowShell: true, allowBrowser: false, profile: "dev" },
    runs: [{
      id: "run_1",
      projectPath: "D:\\code\\DeepSeekCode",
      model: "deepseek-v4-flash",
      status: "succeeded",
      message: "done",
      createdAtMs: 1,
      updatedAtMs: 2,
      actionCount: 3,
      artifactCount: 0,
      eventCount: 4,
    }],
  });

  const options = diagnosticsDisplayOptions(model);
  assert.equal(model.badge, "1 issue");
  assert.equal(options.find((option) => option.id === "permissions")?.selected, true);
  assert.match(options.find((option) => option.id === "runs")?.detail ?? "", /run_1/);
});
