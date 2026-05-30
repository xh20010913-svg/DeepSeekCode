import test from "node:test";
import assert from "node:assert/strict";
import { approvalPanelSummary } from "./ApprovalPanel.js";
import type { ApprovalGateRecord } from "../state/sqlite.js";

function gate(status: ApprovalGateRecord["status"]): ApprovalGateRecord {
  return {
    id: `approval_${status}`,
    runId: "run_1",
    subjectType: "tool_action",
    subjectId: `subject_${status}`,
    status,
    summary: "run_command command=npm.cmd test cwd=.",
    rationale: "",
    createdAtMs: 1,
    updatedAtMs: 1,
  };
}

test("approval panel summary counts gate states", () => {
  assert.deepEqual(approvalPanelSummary([
    gate("pending"),
    gate("approved"),
    gate("rejected"),
    gate("cancelled"),
    gate("pending"),
  ]), {
    total: 5,
    pending: 2,
    approved: 1,
    rejected: 1,
    cancelled: 1,
  });
});
