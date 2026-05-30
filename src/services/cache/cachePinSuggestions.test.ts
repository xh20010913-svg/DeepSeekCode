import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CachePinService } from "./cachePins.js";
import {
  applyCachePinSuggestions,
  createCachePinFromSource,
  formatCachePinApplyResult,
  formatCachePinSuggestions,
  suggestCachePins,
} from "./cachePinSuggestions.js";

test("cache pin suggestions prefer stable project facts", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-suggest-"));
  fs.writeFileSync(path.join(projectPath, "README.md"), "# DeepSeekCode\nStable project architecture and cache plan notes.\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({
    name: "deepseekcode",
    scripts: { smoke: "node scripts/run-tests.mjs" },
  }, null, 2), "utf8");
  fs.mkdirSync(path.join(projectPath, "docs"));
  fs.writeFileSync(path.join(projectPath, "docs", "architecture.md"), "Architecture is TypeScript-first with local tools.\n", "utf8");

  const suggestions = suggestCachePins(projectPath, { goal: "architecture cache", limit: 3 });
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0]?.sourcePath, "README.md");
  assert.match(suggestions.map((item) => item.sourcePath).join("\n"), /docs\/architecture\.md/);
  assert.match(formatCachePinSuggestions(suggestions), /command=\/cache pin add/);
});

test("cache pin suggestions redact secrets and mark existing pins", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-suggest-"));
  fs.writeFileSync(path.join(projectPath, "README.md"), "api_key = demo-token\nStable facts remain.\n", "utf8");
  new CachePinService(projectPath).create("readme", "Source: README.md\nStable facts remain.");

  const suggestions = suggestCachePins(projectPath, { goal: "stable", limit: 1 });
  assert.equal(suggestions[0]?.alreadyPinned, true);
  assert.doesNotMatch(suggestions[0]?.preview ?? "", /demo-token/);
  assert.match(suggestions[0]?.preview ?? "", /\[redacted\]/i);
});

test("cache pin from source creates a redacted bounded pin", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-suggest-"));
  fs.mkdirSync(path.join(projectPath, "docs"));
  fs.writeFileSync(path.join(projectPath, "docs", "architecture.md"), [
    "# Architecture",
    "api_key = demo-token",
    "DeepSeekCode keeps stable cache facts first.",
  ].join("\n"), "utf8");

  const created = createCachePinFromSource(projectPath, "docs/architecture.md", "arch");
  assert.equal(created.name, "arch");
  assert.equal(created.sourcePath, "docs/architecture.md");
  const pin = new CachePinService(projectPath).load("arch");
  assert.match(pin?.content ?? "", /Source: docs\/architecture\.md/);
  assert.doesNotMatch(pin?.content ?? "", /demo-token/);
  assert.match(pin?.content ?? "", /\[redacted\]/i);
  assert.throws(() => createCachePinFromSource(projectPath, "../secret.md"), /traversal|escapes/);
});

test("cache pin apply creates stable pins and skips existing candidates", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-apply-"));
  fs.mkdirSync(path.join(projectPath, "docs"));
  fs.writeFileSync(path.join(projectPath, "README.md"), "# DeepSeekCode\nStable project architecture.\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "docs", "cache.md"), "DeepSeek cache pins keep reusable facts stable.\n", "utf8");
  fs.writeFileSync(path.join(projectPath, "package.json"), JSON.stringify({ name: "deepseekcode" }, null, 2), "utf8");

  const applied = applyCachePinSuggestions(projectPath, { goal: "architecture cache", limit: 3 });
  assert.equal(applied.created.length, 3);
  assert.equal(applied.errors.length, 0);
  assert.match(formatCachePinApplyResult(applied), /cache pin apply: created=3/);
  assert.equal(new CachePinService(projectPath).list().length, 3);

  const repeat = applyCachePinSuggestions(projectPath, { goal: "architecture cache", limit: 3 });
  assert.equal(repeat.created.length, 0);
  assert.ok(repeat.skipped.length >= 3);
  assert.match(formatCachePinApplyResult(repeat), /No new stable cache pins/);
});
