import test from "node:test";
import assert from "node:assert/strict";
import { planPanelModel } from "./PlanPanel.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";
import type { PlanRecord } from "../services/plans/planModeService.js";

const gate: ApprovalGateRecord = {
  id: "approval_plan",
  runId: "run_1",
  subjectType: "plan",
  subjectId: "run_1",
  status: "pending",
  summary: "Approve implementation plan: Build the UI",
  rationale: "",
  createdAtMs: 1,
  updatedAtMs: 1,
};

test("plan panel model summarizes a pending plan gate", () => {
  const record: PlanRecord = {
    runId: "run_1",
    path: "D:/code/DeepSeekCode/.deepseekcode/plans/run_1.md",
    relativePath: ".deepseekcode/plans/run_1.md",
    content: "# Build the UI\n\n1. Port panel\n2. Test it\n",
    gate,
  };

  const model = planPanelModel(record);
  assert.equal(model.status, "pending");
  assert.equal(model.approval, "approval_plan pending");
  assert.equal(model.summary, "Approve implementation plan: Build the UI");
  assert.deepEqual(model.preview, ["# Build the UI", "1. Port panel", "2. Test it"]);
  assert.deepEqual(model.commands.map((command) => command.command), [
    "/plan show run_1",
    "/plan path run_1",
    "/plan approve approval_plan <reason>",
    "/plan reject approval_plan <reason>",
    "/plan cancel approval_plan <reason>",
  ]);
});

test("plan panel model exposes submit command for draft plans", () => {
  const model = planPanelModel({
    runId: "run_2",
    path: "D:/code/DeepSeekCode/.deepseekcode/plans/run_2.md",
    relativePath: ".deepseekcode/plans/run_2.md",
    content: "Draft plan\n",
  });

  assert.equal(model.status, "draft");
  assert.equal(model.commands.at(-1)?.command, "/plan exit run_2");
});
