import test from "node:test";
import assert from "node:assert/strict";
import {
  permissionPanelCommandOptions,
  permissionPanelModel,
  permissionPanelProfileOptions,
} from "./PermissionPanel.js";

test("permission panel model marks the active profile and controls", () => {
  const model = permissionPanelModel({
    allowShell: true,
    allowBrowser: false,
    profile: "dev",
  });

  assert.equal(model.currentProfile, "dev");
  assert.equal(model.shell, "on");
  assert.equal(model.browser, "off");
  assert.equal(model.rows.find((row) => row.name === "dev")?.active, true);
  assert.equal(model.rows.find((row) => row.name === "safe")?.active, false);
  assert.equal(permissionPanelProfileOptions(model).find((option) => option.id === "dev")?.selected, true);
});

test("permission panel model infers custom state", () => {
  const model = permissionPanelModel({
    allowShell: true,
    allowBrowser: false,
    profile: "custom",
  });

  assert.equal(model.currentProfile, "custom");
  assert.equal(model.rows.some((row) => row.active), false);
  assert.deepEqual(permissionPanelProfileOptions(model)[0], {
    id: "custom",
    label: "custom",
    detail: "shell on | browser off",
    description: "manual runtime override; not one of the built-in profiles",
    selected: true,
    tone: "warning",
  });
});

test("permission panel exposes profile switching commands", () => {
  assert.deepEqual(permissionPanelCommandOptions().map((option) => option.detail), [
    "/permissions profile safe",
    "/permissions profile dev",
    "/permissions profile browser",
    "/permissions profile open",
  ]);
});
