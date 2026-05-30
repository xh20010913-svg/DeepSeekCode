import test from "node:test";
import assert from "node:assert/strict";
import { parseApprovalResultMessage } from "./ApprovalResultBlock.js";

test("approval result parser extracts required gate and retry hint", () => {
  assert.deepEqual(
    parseApprovalResultMessage(
      "Approval required: approval_123 run_command command=npm.cmd test cwd=.. Run /approval approve approval_123 <reason>, then retry the request.",
    ),
    {
      status: "required",
      gateId: "approval_123",
      action: "run_command",
      summary: "run_command command=npm.cmd test cwd=.",
      hint: "Run /approval approve approval_123 <reason>, then retry the request.",
    },
  );
});

test("approval result parser extracts rejected and cancelled gates", () => {
  assert.deepEqual(parseApprovalResultMessage("Approval rejected: approval_abc write_file path=a.ts"), {
    status: "rejected",
    gateId: "approval_abc",
    action: "write_file",
    summary: "write_file path=a.ts",
  });
  assert.deepEqual(parseApprovalResultMessage("Approval canceled: approval_def apply_patch path=a.ts"), {
    status: "cancelled",
    gateId: "approval_def",
    action: "apply_patch",
    summary: "apply_patch path=a.ts",
  });
});
