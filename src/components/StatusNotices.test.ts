import test from "node:test";
import assert from "node:assert/strict";
import { statusNoticesModel } from "./StatusNotices.js";

test("status notices model counts startup warnings", () => {
  const model = statusNoticesModel({
    providerReady: false,
    permissionProfile: "safe",
    shellEnabled: false,
    browserEnabled: false,
  });

  assert.equal(model.count, 1);
  assert.equal(model.highestSeverity, "warning");
  assert.match(model.subtitle, /DeepSeek tokens/);
});

test("status notices model marks open access as highest severity", () => {
  const model = statusNoticesModel({
    providerReady: true,
    permissionProfile: "open",
    shellEnabled: true,
    browserEnabled: true,
  });

  assert.equal(model.highestSeverity, "error");
});
