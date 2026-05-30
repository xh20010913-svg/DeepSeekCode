import test from "node:test";
import assert from "node:assert/strict";
import {
  browserSessionsPanelModel,
  browserStatusPanelModel,
  browserTrajectoryPanelModel,
} from "./BrowserPanel.js";

test("browser status panel reflects permission state", () => {
  const model = browserStatusPanelModel(true);

  assert.equal(model.rows[0]?.status, "on");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.detail ?? "", /allowed/);
});

test("browser sessions panel marks opened sessions", () => {
  const model = browserSessionsPanelModel([{
    id: "browser_1",
    url: "https://example.com",
    visible: true,
    status: "opened",
    createdAtMs: 1,
  }]);

  assert.equal(model.rows[0]?.status, "opened");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /visible/);
});

test("browser trajectory panel summarizes action metadata", () => {
  const model = browserTrajectoryPanelModel([{
    id: "browser_traj_1",
    action: "screenshot",
    source: "command",
    url: "https://example.com",
    status: "succeeded",
    path: "artifacts/page.png",
    bytes: 1234,
    createdAtMs: 1,
  }]);

  assert.equal(model.rows[0]?.name, "screenshot");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /bytes=1234/);
});
