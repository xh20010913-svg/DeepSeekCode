import test from "node:test";
import assert from "node:assert/strict";
import { budgetPanelModel } from "./BudgetPanel.js";

test("budget panel model summarizes effort and token caps", () => {
  const model = budgetPanelModel({
    action: "set",
    path: "D:\\project\\.deepseekcode\\inference.json",
    budget: {
      effort: "low",
      actionContextChars: 8000,
      actionDynamicChars: 12000,
      sideQuestionContextChars: 6000,
      sideQuestionDynamicChars: 8000,
      maxOutputTokens: 700,
    },
    runtimeMaxOutputTokens: 700,
  });

  assert.equal(model.title, "Effort updated");
  assert.equal(model.badge, "low");
  assert.equal(model.badgeTone, "success");
  assert.equal(model.rows.find((row) => row.key === "output")?.value, "700");
  assert.equal(model.callout?.selectedIndex, 0);
  assert.match(model.callout?.message ?? "", /Cheap loop/);
});

test("budget panel model marks max effort as higher risk for token use", () => {
  const model = budgetPanelModel({
    action: "status",
    budget: {
      effort: "max",
      actionContextChars: 28000,
      actionDynamicChars: 36000,
      sideQuestionContextChars: 18000,
      sideQuestionDynamicChars: 24000,
      maxOutputTokens: 1800,
    },
  });

  assert.equal(model.badgeTone, "warning");
  assert.equal(model.rows.every((row) => row.ratio > 0), true);
  assert.match(model.callout?.message ?? "", /Max budget/);
});
