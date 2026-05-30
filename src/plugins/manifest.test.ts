import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePluginName,
  parsePluginManifest,
  renderPluginManifest,
  validatePluginManifest,
} from "./manifest.js";

test("plugin manifests are rendered, normalized, and validated", () => {
  assert.equal(normalizePluginName("DeepSeek Helper!"), "deepseek-helper");
  const document = renderPluginManifest({
    name: "DeepSeek Helper",
    description: "Project helper commands",
  });
  const manifest = parsePluginManifest(JSON.parse(document));
  assert.equal(manifest.name, "deepseek-helper");
  assert.equal(manifest.commands[0]?.name, "hello");
  assert.deepEqual(manifest.agents, ["agents"]);
  assert.deepEqual(manifest.output_styles, ["output-styles"]);
  assert.equal(validatePluginManifest("deepseek-helper", "x/deepseek-helper", document).ok, true);

  const invalid = validatePluginManifest(
    "deepseek-helper",
    "x/deepseek-helper",
    document.replace('"name": "deepseek-helper"', '"name": "other"'),
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0] ?? "", /does not match/);
});

test("plugin manifest validation reports missing and weak command definitions", () => {
  assert.equal(validatePluginManifest("missing", "x/missing", null).ok, false);
  const weak = validatePluginManifest("weak", "x/weak", JSON.stringify({
    name: "weak",
    commands: [{ name: "empty" }],
  }));
  assert.equal(weak.ok, true);
  assert.match(weak.warnings[0] ?? "", /no response or prompt/);
});

test("plugin manifest validation covers extension paths and hooks", () => {
  const invalid = validatePluginManifest("demo", "plugins/demo", JSON.stringify({
    name: "demo",
    agents: ["../outside"],
    output_styles: ["C:\\temp"],
    hooks: [
      { id: "pre", event: "PreToolUse", command: "node -p 1" },
      { id: "pre", event: "PostToolUse", command: "node -p 2" },
    ],
  }));
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /escapes plugin root/);
  assert.match(invalid.errors.join("\n"), /duplicate hook/);
});
