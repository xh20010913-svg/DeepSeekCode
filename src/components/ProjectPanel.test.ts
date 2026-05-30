import test from "node:test";
import assert from "node:assert/strict";
import {
  branchPanelModel,
  exportPanelModel,
  initPanelModel,
  modelPanelModel,
  projectPanelModel,
} from "./ProjectPanel.js";

test("model panel marks missing and verified providers", () => {
  const missing = modelPanelModel({
    model: "deepseek-v4-flash",
    providerReady: false,
  });
  assert.equal(missing.badge, "missing");
  assert.equal(missing.badgeTone, "warning");

  const verified = modelPanelModel({
    model: "deepseek-v4-flash",
    providerName: "deepseek",
    providerReady: true,
    verifiedModel: "deepseek-chat",
    verifiedText: "ok",
  });
  assert.equal(verified.badgeTone, "success");
  assert.equal(verified.rows.some((row) => row.key === "reply"), true);
  assert.equal(verified.modelPicker?.options[verified.modelPicker.selectedIndex]?.id, "deepseek-chat");
});

test("branch panel reports unavailable git state without throwing", () => {
  const model = branchPanelModel({
    branchOk: false,
    branch: "",
    gitStatus: "unavailable",
    error: "not a git repository",
  });
  assert.equal(model.badge, "unavailable");
  assert.match(model.rows[0]?.value ?? "", /not a git/);
});

test("project panel includes runtime paths and permission profile", () => {
  const model = projectPanelModel({
    projectPath: "D:\\project",
    dataDir: "D:\\project\\.deepseekcode",
    stateDbPath: "D:\\project\\.deepseekcode\\state.sqlite",
    model: "deepseek-v4-flash",
    permissionProfile: "safe",
  });
  assert.equal(model.badge, "safe");
  assert.equal(model.rows.some((row) => row.key === "state"), true);
});

test("init and export panels summarize file effects", () => {
  const init = initPanelModel({
    created: [".deepseekcode"],
    existing: ["DEEPSEEKCODE.md"],
  }, false);
  assert.equal(init.badge, "updated");
  assert.equal(init.rows.length, 2);

  const exported = exportPanelModel({
    kind: "status",
    result: {
      path: "D:\\project\\.deepseekcode\\exports\\status.md",
      bytes: 120,
      format: "markdown",
    },
  });
  assert.equal(exported.badge, "markdown");
  assert.equal(exported.rows.find((row) => row.key === "bytes")?.value, "120");
});
