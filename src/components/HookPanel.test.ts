import test from "node:test";
import assert from "node:assert/strict";
import {
  hookListPanelModel,
  hookPanelCommandOptions,
  hookPanelEventOptions,
  hookPanelHookOptions,
  hookPanelTabs,
  hookValidationPanelModel,
} from "./HookPanel.js";

test("hook list panel model summarizes configured hooks", () => {
  const model = hookListPanelModel([
    {
      id: "block-rm",
      event: "PreToolUse",
      matcher: "run_command",
      command: "node hooks/block-rm.js",
      description: "Block destructive shell commands",
      timeout_ms: 10_000,
      enabled: true,
    },
  ]);

  assert.equal(model.title, "Hooks");
  assert.equal(model.rows[0]?.id, "block-rm");
  assert.equal(model.rows[0]?.status, "enabled");
  assert.equal(model.rows[0]?.event, "PreToolUse");
  assert.equal(model.rows[0]?.matcher, "run_command");
  assert.match(model.footer, /PreToolUse/);
});

test("hook panel event and hook options mirror the Claude-style drilldown", () => {
  const model = hookListPanelModel([
    {
      id: "block-rm",
      event: "PreToolUse",
      matcher: "run_command",
      command: "node hooks/block-rm.js",
      description: "Block destructive shell commands",
      timeout_ms: 10_000,
      enabled: true,
    },
    {
      id: "after-compact",
      event: "PostCompact",
      command: "node hooks/sync-summary.js",
      timeout_ms: 5_000,
      enabled: false,
    },
  ]);

  const events = hookPanelEventOptions(model);
  const preToolUse = events.find((event) => event.id === "PreToolUse");
  const postCompact = events.find((event) => event.id === "PostCompact");
  assert.equal(preToolUse?.selected, true);
  assert.equal(preToolUse?.detail, "1 hooks | 1 matchers");
  assert.match(preToolUse?.description ?? "", /enabled 1/);
  assert.equal(postCompact?.tone, "warning");

  const hooks = hookPanelHookOptions(model, "PreToolUse");
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0]?.label, "block-rm");
  assert.match(hooks[0]?.description ?? "", /Block destructive/);

  assert.equal(hookPanelTabs(model)[1]?.count, 2);
  assert.equal(hookPanelCommandOptions()[0]?.id, "validate");
});

test("hook validation panel model surfaces errors and warnings", () => {
  const model = hookValidationPanelModel({
    path: "D:\\project\\.deepseekcode\\hooks.json",
    ok: false,
    errors: ["duplicate hook id"],
    warnings: ["missing matcher"],
  });

  assert.equal(model.title, "Hook validation");
  assert.equal(model.rows[0]?.status, "failed");
  assert.equal(model.rows[0]?.tone, "error");
  assert.match(model.rows[0]?.command ?? "", /duplicate hook id/);
  assert.match(model.rows[0]?.note ?? "", /missing matcher/);
  assert.equal(hookPanelEventOptions(model).find((event) => event.id === "config")?.selected, true);
});
