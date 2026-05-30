import test from "node:test";
import assert from "node:assert/strict";
import { approvalDecisionOptionsModel } from "./ApprovalDecisionOptions.js";

test("approval decision options expose tool approval commands", () => {
  assert.deepEqual(approvalDecisionOptionsModel({
    gateId: "approval_1",
    subjectType: "tool_action",
    status: "pending",
    summary: "run_command command=npm.cmd test cwd=.",
  }), [
    {
      label: "approve once",
      command: "/approval approve approval_1 <reason>",
      description: "allow this exact action fingerprint",
      tone: "allow",
    },
    {
      label: "reject",
      command: "/approval reject approval_1 <reason>",
      description: "block and send feedback",
      tone: "reject",
    },
    {
      label: "cancel",
      command: "/approval cancel approval_1 <reason>",
      description: "close without approving",
      tone: "neutral",
    },
  ]);
});

test("approval decision options add file diff follow-up for edit gates", () => {
  const options = approvalDecisionOptionsModel({
    gateId: "approval_file",
    subjectType: "tool_action",
    status: "pending",
    summary: "write_file path=src/index.ts overwrite=true chars=120 lines=5 sha=abc123",
  });

  assert.equal(options.at(-1)?.label, "inspect diff");
  assert.equal(options.at(-1)?.command, "/diff git src/index.ts");
  assert.equal(options.at(-1)?.tone, "inspect");
});

test("approval decision options cover question and plan gates", () => {
  assert.deepEqual(approvalDecisionOptionsModel({
    gateId: "approval_q",
    subjectType: "question",
    status: "pending",
    summary: "question",
  }).map((option) => option.command), [
    "/question show approval_q",
    "/question answer approval_q <answer>",
    "/question reject approval_q <reason>",
  ]);

  assert.deepEqual(approvalDecisionOptionsModel({
    gateId: "approval_plan",
    subjectType: "plan",
    status: "pending",
    summary: "plan",
  }).map((option) => option.command), [
    "/plan approve approval_plan <reason>",
    "/plan reject approval_plan <reason>",
    "/plan cancel approval_plan <reason>",
  ]);
});

test("approval decision options hide resolved gates", () => {
  assert.deepEqual(approvalDecisionOptionsModel({
    gateId: "approval_done",
    subjectType: "tool_action",
    status: "approved",
    summary: "run_command command=npm.cmd test cwd=.",
  }), []);
});
