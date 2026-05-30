import test from "node:test";
import assert from "node:assert/strict";
import {
  sshHealthPanelModel,
  sshHistoryPanelModel,
  sshProfilesPanelModel,
  sshSessionsPanelModel,
  sshWorkerPanelModel,
} from "./SshPanel.js";

test("ssh profiles panel shows target and remote path", () => {
  const model = sshProfilesPanelModel([{
    name: "prod",
    host: "example.com",
    user: "deploy",
    port: 2222,
    remotePath: "/srv/app",
  }]);

  assert.equal(model.rows[0]?.name, "prod");
  assert.match(model.rows[0]?.detail ?? "", /deploy@example.com/);
  assert.match(model.rows[0]?.note ?? "", /remotePath=\/srv\/app/);
});

test("ssh sessions panel marks failed sessions", () => {
  const model = sshSessionsPanelModel([{
    id: "ssh_1",
    profileName: "prod",
    target: "deploy@example.com",
    status: "failed",
    createdAtMs: 1,
    updatedAtMs: 1,
  }]);

  assert.equal(model.rows[0]?.status, "failed");
  assert.equal(model.rows[0]?.tone, "error");
});

test("ssh history panel classifies exit state", () => {
  const model = sshHistoryPanelModel([{
    id: "ssh_cmd_1",
    profileName: "prod",
    target: "deploy@example.com",
    command: "npm test",
    exitCode: 0,
    timedOut: false,
    stdout: "ok",
    stderr: "",
    durationMs: 123,
    createdAtMs: 1,
  }]);

  assert.equal(model.rows[0]?.status, "ok");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /duration=123ms/);
});

test("ssh health panel includes session id", () => {
  const model = sshHealthPanelModel({
    status: "ok",
    profileName: "prod",
    target: "deploy@example.com",
    message: "exit=0",
    output: {
      command: "printf deepseekcode-ssh-ok",
      target: "deploy@example.com",
      exitCode: 0,
      timedOut: false,
      stdout: "deepseekcode-ssh-ok",
      stderr: "",
      durationMs: 10,
    },
  }, "ssh_1");

  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /session=ssh_1/);
});

test("ssh worker panel previews steps", () => {
  const model = sshWorkerPanelModel({
    status: "max_steps",
    runId: "run_1",
    profileName: "prod",
    message: "stopped after 2 SSH worker steps",
    steps: [{
      status: "completed",
      message: "exit=0",
    }],
  });

  assert.equal(model.rows[0]?.status, "completed");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.preview?.join("\n") ?? "", /max_steps/);
});
