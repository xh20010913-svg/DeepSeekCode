import test from "node:test";
import assert from "node:assert/strict";
import { buildFooterModel } from "./Footer.js";

test("footer model surfaces queue and working affordance", () => {
  const model = buildFooterModel({
    busy: true,
    queuedCount: 2,
    cache: { rate: "75%", hitTokens: 30, missTokens: 10, observedRuns: 1 },
    pendingGates: 1,
    profile: "safe",
    shellEnabled: false,
    browserEnabled: false,
    providerReady: true,
    providerModel: "deepseek-v4-flash",
    effort: "low",
    compact: false,
  });

  assert.equal(model.statusLabel, "working");
  assert.equal(model.statusTone, "warning");
  assert.equal(model.left, "cache 75% (30/10) | L low flash | /effort | queue 2");
  assert.equal(model.hint, "Enter queues next prompt | /cancel stops run | ? shortcuts");
  assert.equal(model.right, "safe | shell off | browser off | gates 1 | deepseek-v4-flash");
});

test("footer model highlights missing provider in the right segment", () => {
  const model = buildFooterModel({
    busy: false,
    queuedCount: 0,
    cache: { rate: "n/a", hitTokens: 0, missTokens: 0, observedRuns: 0 },
    pendingGates: 0,
    profile: "dev",
    shellEnabled: true,
    browserEnabled: false,
    providerReady: false,
    providerModel: "deepseek-v4-flash",
    effort: "auto",
    compact: true,
  });

  assert.equal(model.statusLabel, "idle");
  assert.equal(model.left, "cache n/a | A auto flash | /effort");
  assert.equal(model.hint, "Ctrl+P commands | Ctrl+O files | Ctrl+R history | ? shortcuts");
  assert.equal(model.right, "dev | shell on | browser off | gates 0 | provider missing");
});
