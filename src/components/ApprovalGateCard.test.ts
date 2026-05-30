import test from "node:test";
import assert from "node:assert/strict";
import { approvalGateCardModel, hintForGate, labelForSubject } from "./ApprovalGateCard.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

const gate: ApprovalGateRecord = {
  id: "approval_1",
  runId: "run_1",
  subjectType: "tool_action",
  subjectId: "tool_hash",
  status: "pending",
  summary: "run_command command=npm.cmd test cwd=.",
  rationale: "",
  createdAtMs: 1,
  updatedAtMs: 1,
};

test("approval gate card model exposes action summary and next command", () => {
  assert.deepEqual(approvalGateCardModel(gate), {
    label: "approval",
    labelColor: "magenta",
    statusColor: "yellow",
    action: "run_command",
    hint: "/approval approve approval_1 <reason> | /approval reject approval_1 <reason>",
    summary: "run_command command=npm.cmd test cwd=.",
  });
});

test("approval gate labels and hints cover plan and question gates", () => {
  assert.equal(labelForSubject("plan"), "plan");
  assert.equal(labelForSubject("question"), "question");
  assert.equal(hintForGate("plan", "approval_plan"), "/plan approve approval_plan <reason> | /plan reject approval_plan <reason>");
  assert.equal(hintForGate("question", "approval_q"), "/question show approval_q | /question answer approval_q <answer>");
});
