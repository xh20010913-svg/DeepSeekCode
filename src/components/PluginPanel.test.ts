import test from "node:test";
import assert from "node:assert/strict";
import {
  pluginDetailPanelModel,
  pluginListPanelModel,
  pluginSearchPanelModel,
  pluginValidationPanelModel,
} from "./PluginPanel.js";

test("plugin list panel marks enabled plugin commands and components", () => {
  const model = pluginListPanelModel([{
    name: "docs",
    scope: "project",
    path: "D:\\project\\.deepseekcode\\plugins\\docs",
    enabled: true,
    manifest: {
      name: "docs",
      version: "0.1.0",
      description: "Docs workflow",
      commands: [{
        name: "write",
        aliases: [],
        description: "Write docs",
      }],
      agents: ["agents"],
      output_styles: ["output-styles"],
      hooks: [],
    },
  }]);

  assert.equal(model.title, "Plugins");
  assert.equal(model.rows[0]?.name, "project/docs");
  assert.equal(model.rows[0]?.status, "enabled");
  assert.equal(model.rows[0]?.tone, "success");
  assert.match(model.rows[0]?.note ?? "", /\/docs:write/);
  assert.match(model.rows[0]?.note ?? "", /agents=1/);
});

test("plugin search panel includes source and disabled state", () => {
  const model = pluginSearchPanelModel([{
    name: "review",
    scope: "user",
    enabled: false,
    path: "C:\\Users\\me\\.deepseekcode\\plugins\\review",
    description: "Review plugin",
    commands: ["run"],
    source: {
      kind: "path",
      sourcePath: "D:\\plugins\\review",
      installedAtMs: 1,
    },
  }], "rev");

  assert.equal(model.subtitle, "query: rev");
  assert.equal(model.rows[0]?.status, "disabled");
  assert.equal(model.rows[0]?.tone, "muted");
  assert.match(model.rows[0]?.note ?? "", /source=path:D:\\plugins\\review/);
});

test("plugin detail panel summarizes manifest components", () => {
  const model = pluginDetailPanelModel({
    name: "ops",
    scope: "project",
    path: "D:\\project\\.deepseekcode\\plugins\\ops",
    enabled: true,
    manifest: {
      name: "ops",
      description: "Ops helpers",
      commands: [],
      agents: [],
      output_styles: ["output-styles"],
      hooks: [{
        id: "audit",
        event: "PreToolUse",
        command: "node audit.js",
        enabled: true,
        timeout_ms: 1000,
      }],
    },
  });

  assert.equal(model.rows[0]?.name, "project/ops");
  assert.deepEqual(model.preview?.slice(-2), ["output styles: output-styles", "hooks: PreToolUse:audit"]);
});

test("plugin validation panel surfaces errors and warnings", () => {
  const model = pluginValidationPanelModel([{
    name: "broken",
    path: "D:\\project\\.deepseekcode\\plugins\\broken",
    ok: false,
    errors: ["missing .codex-plugin/plugin.json"],
    warnings: ["no slash commands configured"],
  }]);

  assert.equal(model.rows[0]?.status, "failed");
  assert.equal(model.rows[0]?.tone, "error");
  assert.match(model.rows[0]?.note ?? "", /missing .codex-plugin/);
});
