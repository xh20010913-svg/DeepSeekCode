import test from "node:test";
import assert from "node:assert/strict";
import { questionApprovalPreviewModelFromRecord } from "./QuestionApprovalPreviewBlock.js";
import type { QuestionRecord } from "../services/questions/questionService.js";

const record: QuestionRecord = {
  gateId: "approval_q",
  runId: "run_1",
  status: "pending",
  createdAtMs: 1,
  updatedAtMs: 1,
  questions: [
    {
      header: "Direction",
      question: "Which frontend permission surface should be ported next?",
      options: [
        { label: "approval", description: "Improve permission dialogs first", preview: "low backend risk" },
        { label: "settings", description: "Build settings screens next" },
      ],
    },
  ],
};

test("question approval preview keeps prompt and options together", () => {
  assert.deepEqual(questionApprovalPreviewModelFromRecord(record, 80), {
    title: "Question preview",
    status: "pending",
    questions: [
      {
        header: "Direction",
        question: "Which frontend permission surface should be ported next?",
        multiSelect: false,
        options: [
          {
            label: "approval",
            description: "Improve permission dialogs first",
            preview: "low backend risk",
          },
          {
            label: "settings",
            description: "Build settings screens next",
            preview: "",
          },
        ],
      },
    ],
  });
});
