import test from "node:test";
import assert from "node:assert/strict";
import { effortLevelLabel, effortLevelToSymbol, getEffortNotificationText } from "./EffortIndicator.js";

test("effort indicator uses compact terminal-safe symbols", () => {
  assert.equal(effortLevelToSymbol("low"), "L");
  assert.equal(effortLevelToSymbol("medium"), "M");
  assert.equal(effortLevelToSymbol("high"), "H");
  assert.equal(effortLevelToSymbol("max"), "X");
  assert.equal(effortLevelToSymbol("auto"), "A");
});

test("effort indicator labels token spending intent", () => {
  assert.equal(effortLevelLabel("low"), "token saver");
  assert.equal(effortLevelLabel("max"), "max spend");
  assert.equal(getEffortNotificationText("medium", "deepseek-v4-flash"), "M medium flash | /effort");
});
