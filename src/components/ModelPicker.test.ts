import test from "node:test";
import assert from "node:assert/strict";
import { modelPickerModel } from "./ModelPicker.js";

test("model picker marks flash as selected for cheap testing", () => {
  const model = modelPickerModel({
    activeModel: "deepseek-v4-flash",
    providerName: "deepseek",
    providerReady: true,
  });

  assert.equal(model.options[model.selectedIndex]?.id, "deepseek-v4-flash");
  assert.equal(model.options[model.selectedIndex]?.status, "test");
  assert.match(model.footer, /flash/);
});

test("model picker preserves unknown current model", () => {
  const model = modelPickerModel({
    activeModel: "custom-profile-model",
    providerReady: false,
  });

  assert.equal(model.options[0]?.id, "custom-profile-model");
  assert.equal(model.options[0]?.selected, true);
  assert.match(model.subtitle, /provider missing/);
});
