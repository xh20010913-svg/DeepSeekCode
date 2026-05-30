import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import { initializeDeepSeekCodeProject } from "./projectInit.js";

test("initializeDeepSeekCodeProject creates guidance and local extension folders", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-init-"));
  const config: RuntimeConfig = {
    projectPath,
    dataDir: path.join(projectPath, ".data"),
    stateDbPath: path.join(projectPath, ".data", "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: false,
    browserEnabled: false,
    permissionProfile: "safe",
  };
  const result = initializeDeepSeekCodeProject(config);
  assert.ok(result.created.includes("DEEPSEEKCODE.md"));
  assert.equal(fs.existsSync(path.join(projectPath, ".deepseekcode", "commands", "verify.md")), true);
  assert.equal(fs.existsSync(path.join(projectPath, ".deepseekcode", "cache-pins")), true);
  assert.match(fs.readFileSync(path.join(projectPath, "DEEPSEEKCODE.md"), "utf8"), /npm\.cmd run smoke/);
  assert.match(fs.readFileSync(path.join(projectPath, "DEEPSEEKCODE.md"), "utf8"), /cache pin add/);

  const second = initializeDeepSeekCodeProject(config);
  assert.ok(second.existing.includes("DEEPSEEKCODE.md"));
});
