import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HookService } from "./hookService.js";

test("HookService creates, validates, matches, and executes project hooks", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-hook-project-"));
  const service = new HookService(projectPath);
  const hook = service.add({
    id: "Pre Read",
    event: "PreToolUse",
    matcher: "read_file",
    command: "node -p 42",
  });
  assert.equal(hook.id, "pre-read");
  assert.equal(service.validate().ok, true);
  assert.equal(await service.runEvent("PreToolUse", { tool_name: "write_file" }, { allowShell: true }).then((r) => r.length), 0);

  const results = await service.runEvent("PreToolUse", { tool_name: "read_file" }, { allowShell: true });
  assert.equal(results[0]?.status, "succeeded");
  assert.match(results[0]?.stdout ?? "", /42/);
  assert.equal(service.remove("pre-read"), true);
  assert.equal(service.list().length, 0);
});

test("HookService skips execution when shell permission is off", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-hook-project-"));
  const service = new HookService(projectPath);
  service.add({
    id: "pre",
    event: "PreToolUse",
    matcher: "*",
    command: "node -p 42",
  });
  const results = await service.runEvent("PreToolUse", { tool_name: "read_file" }, { allowShell: false });
  assert.equal(results[0]?.status, "skipped");
  assert.match(results[0]?.message ?? "", /shell execution is disabled/);
});

test("HookService can turn PreToolUse hooks into blocking decisions", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-hook-project-"));
  const service = new HookService(projectPath);
  service.add({
    id: "block-write",
    event: "PreToolUse",
    matcher: "write_file",
    command: `node -e "console.log(JSON.stringify({decision:'block',reason:'no writes'}))"`,
  });
  const decision = await service.runPreToolUse({ tool_name: "write_file" }, { allowShell: true });
  assert.equal(decision.blocked, true);
  assert.equal(decision.reason, "no writes");
});

test("HookService blocks PreToolUse when a matching hook fails", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-hook-project-"));
  const service = new HookService(projectPath);
  service.add({
    id: "fail-write",
    event: "PreToolUse",
    matcher: "write_file",
    command: `node -e "process.stderr.write('denied by test'); process.exit(3)"`,
  });
  const decision = await service.runPreToolUse({ tool_name: "write_file" }, { allowShell: true });
  assert.equal(decision.blocked, true);
  assert.match(decision.reason ?? "", /denied by test/);
});

test("HookService discovers and runs hooks provided by enabled plugins", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-hook-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-hook-data-"));
  const pluginRoot = path.join(projectPath, ".deepseekcode", "plugins", "demo");
  fs.mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "demo",
    hooks: [{
      id: "pre-read",
      event: "PreToolUse",
      matcher: "read_file",
      command: "node -p 43",
    }],
  }), "utf8");

  const service = new HookService(projectPath, dataDir);
  assert.equal(service.list().some((hook) => hook.id === "demo:pre-read"), true);
  const results = await service.runEvent("PreToolUse", { tool_name: "read_file" }, { allowShell: true });
  assert.equal(results[0]?.id, "demo:pre-read");
  assert.match(results[0]?.stdout ?? "", /43/);
});
