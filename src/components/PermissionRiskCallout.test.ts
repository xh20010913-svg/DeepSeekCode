import test from "node:test";
import assert from "node:assert/strict";
import { permissionRiskModel } from "./PermissionRiskCallout.js";

test("permission risk callout flags fully open sessions", () => {
  assert.deepEqual(permissionRiskModel({ allowShell: true, allowBrowser: true, profile: "open" }), {
    level: "high",
    title: "High trust mode",
    detail: "Shell and browser control are both enabled. Use this only in trusted local projects.",
    color: "yellow",
  });
});

test("permission risk callout differentiates safe and single-capability profiles", () => {
  assert.equal(permissionRiskModel({ allowShell: false, allowBrowser: false, profile: "safe" }).level, "low");
  assert.equal(permissionRiskModel({ allowShell: true, allowBrowser: false, profile: "dev" }).title, "Shell enabled");
  assert.equal(permissionRiskModel({ allowShell: false, allowBrowser: true, profile: "browser" }).title, "Browser enabled");
});
