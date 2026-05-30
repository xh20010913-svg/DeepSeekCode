import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CacheGuardPolicyService, formatCacheGuardPolicy, normalizeHitRate } from "./cacheGuardPolicy.js";

test("cache guard policy stores strict and min hit settings", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-guard-policy-"));
  const service = new CacheGuardPolicyService(projectPath);

  assert.equal(service.current().strict, false);
  assert.equal(service.current().minHitRate, 0.35);
  assert.equal(service.current().source, "default");

  const strict = service.setStrict(true);
  assert.equal(strict.strict, true);
  assert.equal(strict.source, "project");
  assert.match(formatCacheGuardPolicy(strict), /strict=on/);

  const minHit = service.setMinHitRate("62%");
  assert.equal(minHit.strict, true);
  assert.equal(minHit.minHitRate, 0.62);
  assert.match(formatCacheGuardPolicy(minHit), /minHit=62%/);
  assert.equal(service.current().minHitRate, 0.62);
  assert.match(service.path(), /cache-guard\.json$/);

  service.reset();
  assert.equal(service.current().source, "default");
});

test("cache guard policy normalizes hit rates and env overrides", () => {
  assert.equal(normalizeHitRate("40%"), 0.4);
  assert.equal(normalizeHitRate("0.4"), 0.4);
  assert.equal(normalizeHitRate(40), 0.4);
  assert.equal(normalizeHitRate(1.2), 0.012);
  assert.equal(normalizeHitRate("bad"), undefined);

  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-guard-policy-"));
  const service = new CacheGuardPolicyService(projectPath);
  service.setStrict(false);
  service.setMinHitRate("20%");
  const previousStrict = process.env.DEEPSEEKCODE_CACHE_GUARD_STRICT;
  const previousMinHit = process.env.DEEPSEEKCODE_CACHE_GUARD_MIN_HIT;
  process.env.DEEPSEEKCODE_CACHE_GUARD_STRICT = "1";
  process.env.DEEPSEEKCODE_CACHE_GUARD_MIN_HIT = "55%";
  try {
    const current = service.current();
    assert.equal(current.strict, true);
    assert.equal(current.minHitRate, 0.55);
    assert.equal(current.source, "env");
  } finally {
    restoreEnv("DEEPSEEKCODE_CACHE_GUARD_STRICT", previousStrict);
    restoreEnv("DEEPSEEKCODE_CACHE_GUARD_MIN_HIT", previousMinHit);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
