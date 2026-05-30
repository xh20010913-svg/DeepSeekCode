import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OutputStyleService } from "./outputStyleService.js";

test("OutputStyleService creates, validates, and selects project styles", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-style-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-style-data-"));
  const service = new OutputStyleService(projectPath, dataDir);
  assert.equal(service.current().name, "deepseek");
  const style = service.createProjectStyle({
    name: "Brief Review",
    description: "Brief review notes",
  });
  assert.equal(style.name, "brief-review");
  assert.equal(service.validate("brief-review")[0]?.ok, true);
  assert.equal(service.setCurrent("brief-review").name, "brief-review");
  assert.equal(new OutputStyleService(projectPath, dataDir).current().name, "brief-review");
  assert.throws(() => service.createProjectStyle({
    name: "brief-review",
    description: "duplicate",
  }), /already exists/);
});

test("OutputStyleService discovers output styles provided by enabled plugins", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-style-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-style-data-"));
  const pluginRoot = path.join(projectPath, ".deepseekcode", "plugins", "demo");
  fs.mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, "styles"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "demo",
    output_styles: ["styles"],
  }), "utf8");
  fs.writeFileSync(path.join(pluginRoot, "styles", "brief.md"), [
    "---",
    "description: Plugin brief style",
    "---",
    "Reply with plugin-provided brevity.",
    "",
  ].join("\n"), "utf8");

  const service = new OutputStyleService(projectPath, dataDir);
  const style = service.load("demo:brief");
  assert.equal(style?.scope, "plugin");
  assert.match(style?.prompt ?? "", /plugin-provided brevity/);
  assert.equal(service.setCurrent("demo:brief").name, "demo:brief");
});
