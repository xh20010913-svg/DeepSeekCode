import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSshHealth } from "./sshHealth.js";
import type { SshProfile } from "./sshProfileService.js";

test("ssh health check reports ok through an injected ssh binary", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-ssh-health-"));
  const fakeSsh = path.join(tempDir, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, "process.stdout.write('deepseekcode-ssh-ok')\n", "utf8");
  const profile: SshProfile = {
    name: "prod",
    host: "example.com",
    user: "deploy",
  };

  const result = await checkSshHealth(profile, {
    allowShell: true,
    sshBin: process.execPath,
    sshBinArgs: [fakeSsh],
  });
  assert.equal(result.status, "ok");
  assert.equal(result.target, "deploy@example.com");
  assert.match(result.message, /deepseekcode-ssh-ok/);
});
