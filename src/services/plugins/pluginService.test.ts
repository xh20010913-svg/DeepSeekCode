import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PluginService } from "./pluginService.js";

test("PluginService creates and validates project plugins", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plugin-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plugin-data-"));
  const service = new PluginService(projectPath, dataDir);
  const plugin = service.createProjectPlugin({
    name: "DeepSeek Helper",
    description: "Project helper commands",
  });
  assert.equal(plugin.name, "deepseek-helper");
  assert.equal(plugin.manifest?.commands[0]?.name, "hello");
  assert.equal(service.validate("deepseek-helper")[0]?.ok, true);
  assert.throws(() => service.createProjectPlugin({
    name: "deepseek-helper",
    description: "duplicate",
  }), /already exists/);
});

test("PluginService installs and uninstalls a local plugin copy", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plugin-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plugin-data-"));
  const sourcePath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plugin-source-"));
  fs.mkdirSync(path.join(sourcePath, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(sourcePath, "node_modules", "skip-me"), { recursive: true });
  fs.writeFileSync(path.join(sourcePath, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "source-helper",
    description: "installable helper",
    commands: [{ name: "hello", response: "hello {args}" }],
  }), "utf8");
  fs.writeFileSync(path.join(sourcePath, "node_modules", "skip-me", "index.js"), "module.exports = 1;\n", "utf8");

  const service = new PluginService(projectPath, dataDir);
  const plugin = service.installFromPath({ sourcePath, name: "installed-helper" });
  assert.equal(plugin.name, "installed-helper");
  assert.equal(plugin.manifest?.name, "installed-helper");
  assert.equal(fs.existsSync(path.join(plugin.path, "node_modules")), false);
  assert.equal(service.validate("installed-helper")[0]?.ok, true);
  assert.equal(service.source("installed-helper")?.sourcePath, path.resolve(sourcePath));
  assert.match(service.search("installable")[0]?.name ?? "", /installed-helper/);
  const installedAtMs = service.source("installed-helper")?.installedAtMs;

  fs.writeFileSync(path.join(sourcePath, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "source-helper",
    description: "updated installable helper",
    commands: [{ name: "hello", response: "updated {args}" }],
  }), "utf8");
  const updated = service.update("installed-helper");
  assert.equal(updated.manifest?.description, "updated installable helper");
  assert.equal(updated.manifest?.commands[0]?.response, "updated {args}");
  assert.equal(service.source("installed-helper")?.installedAtMs, installedAtMs);
  assert.ok(service.source("installed-helper")?.updatedAtMs);

  const removedPath = service.uninstall("installed-helper");
  assert.equal(fs.existsSync(removedPath), false);
});
