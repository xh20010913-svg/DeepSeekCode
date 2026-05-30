import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { QuestionService, formatQuestionRecord } from "./questionService.js";

test("QuestionService creates durable question gates and records answers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-question-"));
  const state = new StateStore(path.join(root, "state.sqlite"));
  const runId = state.createRun({
    projectPath: root,
    model: "deepseek-v4-flash",
    message: "question service",
  });
  const service = new QuestionService(root, state);
  const record = service.request(runId, [{
    header: "Approach",
    question: "Which approach should DeepSeekCode use?",
    options: [
      { label: "Small", description: "Minimal change" },
      { label: "Full", description: "Full workflow" },
    ],
  }]);

  assert.match(record.gateId, /^approval_/);
  assert.equal(state.getRun(runId)?.status, "paused");
  assert.match(formatQuestionRecord(record), /Which approach/);
  const answered = service.answer(record.gateId, "Full");
  assert.equal(answered.status, "approved");
  assert.equal(answered.answer, "Full");
  state.close();
});
