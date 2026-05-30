import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildContextBundle, contextBundlePrompt, redactSecrets } from "./contextBundle.js";
import { WorkspaceDirectoryService } from "../services/workspace/workspaceDirectoryService.js";

test("buildContextBundle selects bounded project text files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-context-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(path.join(root, "image.png"), Buffer.from([1, 2, 3]));
  const bundle = buildContextBundle(root, 1000);
  assert.equal(bundle.selectedFiles.length, 1);
  assert.equal(bundle.selectedFiles[0]?.path, "src/index.ts");
  assert.match(contextBundlePrompt(bundle), /export const ok/);
});

test("buildContextBundle ranks goal-relevant files and skips upstream/vendor noise", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-context-"));
  fs.mkdirSync(path.join(root, "src", "commands"), { recursive: true });
  fs.mkdirSync(path.join(root, "vendor", "claudecode"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "components", "_upstream"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "commands", "queue.ts"), "export const queue = true;\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "components", "_upstream", "huge.ts"), "export const upstream = true;\n", "utf8");
  fs.writeFileSync(path.join(root, "vendor", "claudecode", "copy.ts"), "export const copied = true;\n", "utf8");

  const bundle = buildContextBundle(root, 2000, "queue command");
  const paths = bundle.repositoryMap.files.map((file) => file.path);
  assert.ok(paths.includes("src/commands/queue.ts"));
  assert.ok(!paths.some((file) => file.includes("vendor/")));
  assert.ok(!paths.some((file) => file.includes("_upstream")));
  assert.equal(bundle.selectedFiles[0]?.path, "src/commands/queue.ts");
});

test("buildContextBundle includes extra working directories with stable labels", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-context-"));
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-reference-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(extra, "docs"));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const local = true;\n", "utf8");
  fs.writeFileSync(path.join(extra, "docs", "cache.md"), "Reference cache strategy notes.\n", "utf8");
  const added = new WorkspaceDirectoryService(root).add(extra);
  assert.equal(added.status, "added");

  const bundle = buildContextBundle(root, 2000, "reference cache");
  const paths = bundle.repositoryMap.files.map((file) => file.path);
  assert.ok(paths.some((file) => file.includes("/docs/cache.md")));
  assert.ok(bundle.selectedFiles.some((file) => file.path.includes("/docs/cache.md")));
  assert.match(contextBundlePrompt(bundle), /Reference cache strategy/);
});

test("redactSecrets removes likely credential assignments", () => {
  assert.equal(redactSecrets("DEEPSEEK_API_KEY=abc123"), "DEEPSEEK_API_KEY= [redacted]");
  assert.equal(redactSecrets("token: abc123"), "token= [redacted]");
});
