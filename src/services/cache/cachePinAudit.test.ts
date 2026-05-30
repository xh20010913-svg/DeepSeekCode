import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditCachePinList, auditCachePins, formatCachePinAudit } from "./cachePinAudit.js";
import { CachePinService, type CachePin } from "./cachePins.js";

function pin(name: string, content: string): CachePin {
  return {
    name,
    path: `${name}.md`,
    content,
    chars: content.length,
  };
}

test("cache pin audit reports healthy empty and small pin states", () => {
  assert.match(formatCachePinAudit(auditCachePinList([])), /No cache pins yet/);
  const report = auditCachePinList([pin("arch", "Source: README.md\nStable facts.")]);
  assert.equal(report.severity, "ok");
  assert.match(formatCachePinAudit(report), /healthy/);
});

test("cache pin audit detects secrets, duplicate content, and large pins", () => {
  const large = `${"stable ".repeat(700)}\n`;
  const report = auditCachePinList([
    pin("first", "same content"),
    pin("second", "same   content"),
    pin("large", large),
    pin("secret", "api_key = demo-token"),
  ]);

  assert.equal(report.severity, "error");
  const text = formatCachePinAudit(report);
  assert.match(text, /pin-secret/);
  assert.match(text, /pin-duplicate/);
  assert.match(text, /pin-large/);
});

test("cache pin audit reads project pins from disk", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-audit-"));
  const service = new CachePinService(projectPath);
  service.create("readme", "Source: README.md\nStable facts.");
  const report = auditCachePins(projectPath);
  assert.equal(report.pinCount, 1);
  assert.equal(report.severity, "ok");
});
