import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SshProfileService, normalizeSshName } from "./sshProfileService.js";

test("SshProfileService persists profiles and planned sessions", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-ssh-"));
  const service = new SshProfileService(projectPath);

  assert.equal(normalizeSshName("Prod_Box"), "prod_box");
  assert.equal(normalizeSshName("../prod"), null);
  assert.deepEqual(service.listProfiles(), []);

  const profile = service.addProfile({
    name: "Prod_Box",
    host: "example.com",
    user: "deploy",
    port: 2222,
    remotePath: "/srv/app",
  });
  assert.equal(profile.name, "prod_box");
  assert.equal(service.preview("prod_box"), "ssh -p 2222 deploy@example.com # remotePath=/srv/app");

  const session = service.connect("prod_box");
  assert.equal(session.status, "planned");
  assert.equal(service.updateSessionStatus(session.id, "connected").status, "connected");
  assert.match(service.listSessions()[0]?.target ?? "", /deploy@example\.com/);
  assert.equal(service.close(session.id).status, "closed");
  const command = service.recordCommand("prod_box", {
    command: "echo ok",
    target: "deploy@example.com",
    exitCode: 0,
    stdout: "ok\n",
    stderr: "",
    timedOut: false,
    durationMs: 12,
  });
  assert.match(command.id, /^ssh_cmd_/);
  assert.equal(service.listCommandRecords()[0]?.stdout, "ok\n");

  const reloaded = new SshProfileService(projectPath);
  assert.equal(reloaded.listProfiles()[0]?.host, "example.com");
  assert.equal(reloaded.listSessions()[0]?.status, "closed");
  assert.equal(reloaded.listCommandRecords()[0]?.command, "echo ok");
});
