import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  pullRemoteTextFile,
  pushRemoteTextFile,
  readRemoteTextFile,
  writeRemoteTextFile,
} from "./sshFileSync.js";
import type { SshProfile } from "./sshProfileService.js";

test("ssh file sync reads, writes, pulls, and pushes text through injected ssh", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-ssh-sync-"));
  const fakeSsh = path.join(root, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, fakeSshSource(), "utf8");
  const profile: SshProfile = {
    name: "prod",
    host: "example.com",
    user: "deploy",
    remotePath: "/srv/app",
  };
  const policy = {
    allowShell: true,
    sshBin: process.execPath,
    sshBinArgs: [fakeSsh],
    maxOutputChars: 32_000,
  };

  const read = await readRemoteTextFile(profile, "logs/app.txt", policy);
  assert.equal(read.content, "remote-file:logs/app.txt\n");
  assert.equal(read.bytes, 25);

  const written = await writeRemoteTextFile(profile, "notes/out.txt", "hello remote\n", {
    ...policy,
    overwrite: true,
  });
  assert.match(written.output.stdout, /wrote:hello remote/);

  const pulled = await pullRemoteTextFile(profile, "logs/app.txt", root, "pulled/app.txt", {
    ...policy,
    overwrite: true,
  });
  assert.equal(pulled.localPath, "pulled/app.txt");
  assert.equal(fs.readFileSync(path.join(root, "pulled", "app.txt"), "utf8"), "remote-file:logs/app.txt\n");

  fs.writeFileSync(path.join(root, "local.txt"), "local payload\n", "utf8");
  const pushed = await pushRemoteTextFile(profile, root, "local.txt", "uploads/local.txt", {
    ...policy,
    overwrite: true,
  });
  assert.match(pushed.output.stdout, /wrote:local payload/);
});

function fakeSshSource(): string {
  return `
const args = process.argv.slice(2);
const command = args.at(-1) || "";
let input = "";
process.stdin.on("data", chunk => { input += chunk.toString(); });
process.stdin.on("end", finish);
setTimeout(finish, 20);
let done = false;
function finish() {
  if (done) return;
  done = true;
  if (command.includes("base64 -d >")) {
    process.stdout.write("wrote:" + Buffer.from(input.replace(/\\s+/g, ""), "base64").toString("utf8"));
    return;
  }
  const match = command.match(/base64 '([^']+)'/);
  const remotePath = match ? match[1] : "unknown";
  process.stdout.write(Buffer.from("remote-file:" + remotePath + "\\n", "utf8").toString("base64") + "\\n");
}
`;
}
