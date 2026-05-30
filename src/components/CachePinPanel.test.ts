import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCachePinApplyPanelModel,
  buildCachePinAuditPanelModel,
  buildCachePinSuggestPanelModel,
} from "./CachePinPanel.js";

test("cache pin apply panel summarizes created skipped and error rows", () => {
  const model = buildCachePinApplyPanelModel({
    goal: "cache architecture",
    limit: 4,
    created: [{
      name: "readme",
      path: "cache-pins/readme.md",
      sourcePath: "README.md",
      chars: 120,
      alreadyPinned: false,
    }],
    skipped: [{
      name: "package",
      sourcePath: "package.json",
      score: 95,
      reason: "project identity",
      chars: 80,
      preview: "Source: package.json",
      command: "/cache pin add package ...",
      alreadyPinned: true,
    }],
    errors: [{
      name: "docs-cache",
      sourcePath: "docs/cache.md",
      message: "cache pin source not found: docs/cache.md",
    }],
  });

  assert.equal(model.badge, "review");
  assert.match(model.summary, /created=1 skipped=1 errors=1/);
  assert.deepEqual(model.rows.map((row) => row.label), ["new", "skip", "err"]);
  assert.match(model.footer, /cache pin audit/);
});

test("cache pin apply panel shows an unchanged state when no rows exist", () => {
  const model = buildCachePinApplyPanelModel({
    goal: "",
    limit: 4,
    created: [],
    skipped: [],
    errors: [],
  });

  assert.equal(model.badge, "unchanged");
  assert.equal(model.rows[0]?.name, "no-new-pins");
});

test("cache pin suggest panel summarizes candidates and already pinned rows", () => {
  const model = buildCachePinSuggestPanelModel({
    goal: "cache",
    suggestions: [{
      name: "readme",
      sourcePath: "README.md",
      score: 105,
      reason: "README usually captures durable project intent",
      chars: 140,
      preview: "Source: README.md\nDeepSeekCode",
      command: "/cache pin add readme ...",
      alreadyPinned: false,
    }, {
      name: "package",
      sourcePath: "package.json",
      score: 95,
      reason: "project identity and scripts are stable",
      chars: 90,
      preview: "Source: package.json",
      command: "/cache pin add package ...",
      alreadyPinned: true,
    }],
  });

  assert.equal(model.badge, "candidates");
  assert.match(model.summary, /alreadyPinned=1/);
  assert.deepEqual(model.rows.map((row) => row.label), ["1", "pin"]);
  assert.match(model.footer, /cache pin apply/);
});

test("cache pin audit panel separates healthy and warning states", () => {
  const warning = buildCachePinAuditPanelModel({
    pinCount: 2,
    totalChars: 5000,
    severity: "warning",
    items: [{
      pin: "readme",
      severity: "warning",
      code: "pin-large",
      message: "pin has 5000 chars",
    }],
    recommendation: "Review 1 cache pin warning before large DeepSeek runs.",
  });
  assert.equal(warning.badge, "warning");
  assert.equal(warning.rows[0]?.label, "warning");
  assert.match(warning.footer, /cache pin show/);

  const healthy = buildCachePinAuditPanelModel({
    pinCount: 1,
    totalChars: 120,
    severity: "ok",
    items: [],
    recommendation: "Cache pins look healthy for a stable DeepSeek prefix.",
  });
  assert.equal(healthy.badge, "ok");
  assert.equal(healthy.rows[0]?.label, "ok");
  assert.match(healthy.footer, /cache plan/);
});
