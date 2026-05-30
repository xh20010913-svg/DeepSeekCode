import test from "node:test";
import assert from "node:assert/strict";
import { getCommands } from "./commands.js";
import { getSystemContext } from "./context.js";
import { recordUsageSnapshot, resetUsageTotals } from "./cost-tracker.js";
import { formatDialog } from "./dialogLaunchers.js";
import { normalizePromptInput } from "./interactiveHelpers.js";
import { maybeMarkProjectOnboardingComplete } from "./projectOnboardingState.js";
import { runSetupChecks } from "./setup.js";
import { createSSHSession } from "./ssh/createSSHSession.js";
import { SSHSessionManager } from "./ssh/SSHSessionManager.js";
import { assembleToolPool, getTools } from "./tools.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("root-level Claude-style entry adapters are available", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-root-parity-"));
  resetUsageTotals();
  assert.ok(getCommands().length > 0);
  assert.ok(getTools().length > 0);
  assert.equal(assembleToolPool().length, getTools().length);
  assert.match(getSystemContext({ projectPath }).repository_map, /\(empty\)|/);
  assert.equal(recordUsageSnapshot({ inputTokens: 1 }).inputTokens, 1);
  assert.match(formatDialog({ title: "A", body: "B" }), /A/);
  assert.equal(normalizePromptInput(" hi \r\n"), "hi");
  assert.equal(maybeMarkProjectOnboardingComplete().completed, true);
  assert.ok(runSetupChecks({
    projectPath,
    dataDir: projectPath,
    stateDbPath: path.join(projectPath, "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: false,
    browserEnabled: false,
    permissionProfile: "safe",
  }).length > 0);
  const manager = new SSHSessionManager();
  const session = manager.create("example.com");
  assert.equal(createSSHSession("example.com").host, "example.com");
  manager.close(session.id);
  assert.equal(manager.list()[0]?.status, "closed");
});
