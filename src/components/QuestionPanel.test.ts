import test from "node:test";
import assert from "node:assert/strict";
import { questionPanelModel } from "./QuestionPanel.js";
import type { QuestionRecord } from "../services/questions/questionService.js";

const record: QuestionRecord = {
  gateId: "approval_q",
  runId: "run_1",
  status: "pending",
  questions: [
    {
      header: "Scope",
      question: "Should DeepSeekCode migrate the question UI first?",
      options: [
        { label: "yes", description: "Build the panel now", preview: "Adds a React display panel." },
        { label: "later", description: "Keep the text fallback" },
      ],
    },
  ],
  createdAtMs: 1,
  updatedAtMs: 1,
};

test("question panel model summarizes pending questions and commands", () => {
  const model = questionPanelModel(record);
  assert.equal(model.status, "pending");
  assert.equal(model.questions[0]?.header, "Scope");
  assert.equal(model.questions[0]?.options[0]?.preview, "Adds a React display panel.");
  assert.deepEqual(model.commands.map((command) => command.command), [
    "/question show approval_q",
    "/question answer approval_q <answer>",
    "/question reject approval_q <reason>",
  ]);
});

test("question panel model keeps answered questions read-only", () => {
  const model = questionPanelModel({
    ...record,
    status: "approved",
    answer: "yes",
  });
  assert.equal(model.answer, "yes");
  assert.deepEqual(model.commands.map((command) => command.command), [
    "/question show approval_q",
  ]);
});
