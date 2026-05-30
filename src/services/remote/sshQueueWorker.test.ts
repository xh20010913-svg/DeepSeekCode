import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { SshProfileService } from "./sshProfileService.js";
import { SshQueueWorker, isEligibleSshTask } from "./sshQueueWorker.js";

test("SshQueueWorker claims only eligible remote tasks and records SSH output", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-ssh-worker-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-ssh-worker-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const fakeSsh = path.join(projectPath, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, [
    "const args = process.argv.slice(2);",
    "process.stdout.write(`worker:${args.at(-1)}\\n`);",
  ].join("\n"), "utf8");

  new SshProfileService(projectPath).addProfile({
    name: "prod",
    host: "example.com",
    user: "deploy",
  });
  const runId = state.createRun({
    projectPath,
    model: "deepseek-v4-flash",
    message: "remote worker",
  });
  const localTask = state.createTask({ runId, agent: "Builder", title: "Build locally" });
  const remoteTask = state.createTask({
    runId,
    agent: "ssh:prod",
    title: "Remote smoke",
    detail: "cmd: echo queue-ok",
  });

  assert.equal(isEligibleSshTask(state.listTasks(runId).find((task) => task.id === localTask)!, "prod"), false);
  assert.equal(isEligibleSshTask(state.listTasks(runId).find((task) => task.id === remoteTask)!, "prod"), true);

  const result = await new SshQueueWorker(state, projectPath).drain({
    runId,
    profileName: "prod",
    maxTasks: 2,
    policy: {
      allowShell: true,
      sshBin: process.execPath,
      sshBinArgs: [fakeSsh],
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(state.listTasks(runId).find((task) => task.id === localTask)?.status, "queued");
  assert.equal(state.listTasks(runId).find((task) => task.id === remoteTask)?.status, "succeeded");
  assert.match(new SshProfileService(projectPath).listCommandRecords()[0]?.stdout ?? "", /queue-ok/);
  assert.ok(state.listEvents(runId, 20).some((event) => event.kind === "ssh_worker_step_completed"));
  state.close();
});
