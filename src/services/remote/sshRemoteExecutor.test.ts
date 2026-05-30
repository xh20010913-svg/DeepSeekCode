import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRemoteCommand, buildSshArgs, runSshCommand, summarizeSshCommand } from "./sshRemoteExecutor.js";
import type { SshProfile } from "./sshProfileService.js";

test("ssh remote executor builds safe local args and runs through an injected ssh binary", async () => {
  const profile: SshProfile = {
    name: "prod",
    host: "example.com",
    user: "deploy",
    port: 2222,
    remotePath: "/srv/app",
  };
  assert.equal(buildRemoteCommand(profile, "npm test"), "cd '/srv/app' && npm test");
  assert.deepEqual(buildSshArgs(profile, "npm test"), [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    "2222",
    "deploy@example.com",
    "cd '/srv/app' && npm test",
  ]);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-fake-ssh-"));
  const fakeSsh = path.join(tempDir, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, [
    "const args = process.argv.slice(2);",
    "process.stdout.write(`remote:${args.at(-1)}\\n`);",
  ].join("\n"), "utf8");

  const output = await runSshCommand(profile, "echo ok", {
    allowShell: true,
    sshBin: process.execPath,
    sshBinArgs: [fakeSsh],
  });
  assert.equal(output.exitCode, 0);
  assert.match(output.stdout, /remote:cd '\/srv\/app' && echo ok/);
  assert.match(summarizeSshCommand(output), /exit 0 deploy@example\.com/);
});
