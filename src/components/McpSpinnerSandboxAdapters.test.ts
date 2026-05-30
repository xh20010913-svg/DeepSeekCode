import test from "node:test";
import assert from "node:assert/strict";
import { reconnectDelayLabel, reconnectDelayMs } from "./mcp/utils/reconnectHelpers.js";
import { flashingCharFrame } from "./Spinner/FlashingChar.js";
import { glimmerMessageText } from "./Spinner/GlimmerMessage.js";
import { teammateSelectHint } from "./Spinner/teammateSelectHint.js";
import { spinnerFrame } from "./Spinner/utils.js";
import { sandboxConfigRows } from "./sandbox/SandboxConfigTab.js";
import { sandboxDependencyRows } from "./sandbox/SandboxDependenciesTab.js";
import { sandboxDoctorStatus } from "./sandbox/SandboxDoctorSection.js";
import { sandboxOverrideRows } from "./sandbox/SandboxOverridesTab.js";

test("mcp reconnect helpers back off predictably", () => {
  assert.equal(reconnectDelayMs(0), 500);
  assert.equal(reconnectDelayLabel(2), "2s");
});

test("spinner path helpers expose terminal-safe frames", () => {
  assert.equal(flashingCharFrame(true), "*");
  assert.equal(glimmerMessageText("working", true), "working...");
  assert.equal(teammateSelectHint(2), "2 agents selectable");
  assert.equal(spinnerFrame(3), "/");
});

test("sandbox path helpers summarize settings", () => {
  assert.deepEqual(sandboxConfigRows(false), ["sandbox disabled"]);
  assert.deepEqual(sandboxDependencyRows([]), ["no sandbox dependencies"]);
  assert.equal(sandboxDoctorStatus(true), "sandbox ok");
  assert.deepEqual(sandboxOverrideRows(["shell off"]), ["shell off"]);
});
