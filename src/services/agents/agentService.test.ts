import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentService } from "./agentService.js";

test("AgentService creates, loads, and validates project agents", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-data-"));
  const service = new AgentService(projectPath, dataDir);
  const agent = service.createProjectAgent({
    name: "Code Reviewer",
    description: "Review generated diffs",
    tools: ["read_file", "grep_files"],
    disallowedTools: ["run_command"],
  });
  assert.equal(agent.name, "code-reviewer");
  assert.equal(agent.model, "inherit");
  assert.match(agent.prompt, /Review generated diffs/);
  assert.deepEqual(agent.frontmatter.disallowedTools, ["run_command"]);
  assert.equal(service.validate("code-reviewer")[0]?.ok, true);
  assert.throws(() => service.createProjectAgent({
    name: "code-reviewer",
    description: "duplicate",
  }), /already exists/);
});

test("AgentService discovers agents provided by enabled plugins", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-data-"));
  const pluginRoot = path.join(projectPath, ".deepseekcode", "plugins", "demo");
  fs.mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, "agents"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "demo",
    agents: ["agents"],
  }), "utf8");
  fs.writeFileSync(path.join(pluginRoot, "agents", "reviewer.md"), [
    "---",
    "name: reviewer",
    "description: Plugin reviewer",
    "tools: read_file",
    "---",
    "Review from a plugin.",
    "",
  ].join("\n"), "utf8");

  const service = new AgentService(projectPath, dataDir);
  const agent = service.load("demo:reviewer");
  assert.equal(agent?.scope, "plugin");
  assert.match(agent?.prompt ?? "", /Review from a plugin/);
  assert.equal(service.validate("demo:reviewer")[0]?.ok, true);
});
