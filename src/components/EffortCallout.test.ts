import test from "node:test";
import assert from "node:assert/strict";
import { effortCalloutModel } from "./EffortCallout.js";

test("effort callout selects current budget option", () => {
  const model = effortCalloutModel({
    effort: "high",
    model: "deepseek-v4-flash",
    cache: { rate: "80%", hitTokens: 80, missTokens: 20, observedRuns: 2 },
  });

  assert.equal(model.title, "H high - broad context");
  assert.equal(model.selectedIndex, 2);
  assert.equal(model.options[2]?.selected, true);
  assert.match(model.message, /cache 80%/);
  assert.match(model.footer, /\/cache plan/);
});

test("effort callout warns when max budget is active", () => {
  const model = effortCalloutModel({ effort: "max" });
  assert.match(model.message, /Max budget/);
  assert.equal(model.options.find((option) => option.id === "max")?.tone, "error");
});
