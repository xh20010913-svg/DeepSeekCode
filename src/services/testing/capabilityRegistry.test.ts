import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "../tools/capabilityRegistry.js";

test("capability registry marks launch_project as the long-running project path", () => {
  const registry = new CapabilityRegistry();
  const launch = registry.get("launch_project");
  const command = registry.get("run_command");

  assert.equal(launch?.category, "process");
  assert.equal(launch?.longRunning, true);
  assert.equal(command?.longRunning, false);
  assert.equal(command?.risk, "high");
});

test("capability registry keeps PDF and verification capabilities discoverable", () => {
  const registry = new CapabilityRegistry();
  const pdf = registry.get("create_pdf");
  const verify = registry.get("verify_task");
  const summary = registry.summarize(["create_pdf", "verify_task"]);

  assert.equal(pdf?.category, "pdf");
  assert.match(pdf?.verification ?? "", /%PDF-/);
  assert.equal(verify?.remoteSafe, true);
  assert.match(summary, /create_pdf:pdf/);
  assert.match(summary, /verify_task:document/);
});
