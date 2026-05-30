import test from "node:test";
import assert from "node:assert/strict";
import { statusPanelModel } from "./StatusPanel.js";

test("status panel summarizes provider permissions cache and gates", () => {
  const model = statusPanelModel({
    product: "DeepSeekCode",
    projectPath: "D:\\project",
    dataDir: "D:\\project\\.deepseekcode",
    model: "deepseek-v4-flash",
    providerReady: false,
    permissionProfile: "safe",
    permissions: { shell: false, browser: false },
    cache: { hitTokens: 80, missTokens: 20, rate: "80%", observedRuns: 2 },
    runs: { totalRecent: 1, unfinished: 0 },
    tasks: { queued: 0, running: 0, succeeded: 0, failed: 0, paused: 0, cancelled: 0 },
    gates: { approvalsPending: 1, validationsPending: 0, validationsFailed: 0 },
    git: {
      available: true,
      clean: false,
      modified: 2,
      added: 0,
      deleted: 0,
      renamed: 0,
      untracked: 1,
      conflicted: 0,
      raw: "",
    },
  });

  assert.equal(model.cacheHitTokens, 80);
  assert.equal(model.rows.find((row) => row.key === "provider")?.tone, "error");
  assert.equal(model.rows.find((row) => row.key === "gates")?.tone, "warning");
  assert.match(model.rows.find((row) => row.key === "git")?.detail ?? "", /M=2/);
});
