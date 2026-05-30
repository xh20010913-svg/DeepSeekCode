import test from "node:test";
import assert from "node:assert/strict";
import {
  createServiceAdapter,
  normalizeServiceReference,
  serviceCompatibilityInfo,
  serviceDomain,
  serviceUnsupportedResult,
} from "./compat.js";

test("service adapter normalizes ClaudeCode service paths", () => {
  assert.equal(normalizeServiceReference("mcp\\client.ts"), "mcp/client.ts");
  assert.equal(serviceDomain("compact/autoCompact.ts"), "compact");
  assert.equal(serviceDomain("voice.ts"), "voice");
});

test("service adapter maps cloud API paths to DeepSeekCode local targets", () => {
  const info = serviceCompatibilityInfo("api/claude.ts");
  assert.equal(info.domain, "api");
  assert.equal(info.cloudOnly, true);
  assert.match(info.localTarget, /deepseek/);
});

test("service adapter exposes explicit unsupported messages", () => {
  const adapter = createServiceAdapter("oauth/client.ts");
  const result = adapter.unsupported("oauth login");
  assert.equal(result.status, "unsupported");
  assert.match(result.message, /compatibility path/);
  assert.match(serviceUnsupportedResult("voice.ts").message, /Voice/);
});
