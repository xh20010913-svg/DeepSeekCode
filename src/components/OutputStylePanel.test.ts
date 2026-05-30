import test from "node:test";
import assert from "node:assert/strict";
import {
  outputStyleDetailPanelModel,
  outputStyleListPanelModel,
  outputStyleValidationPanelModel,
} from "./OutputStylePanel.js";

test("output style list panel marks the current style", () => {
  const model = outputStyleListPanelModel([
    {
      name: "deepseek",
      scope: "builtin",
      description: "Default DeepSeek style",
      prompt: "Answer in Chinese",
    },
    {
      name: "brief",
      scope: "project",
      description: "Brief project replies",
      prompt: "Be short",
      path: "D:\\project\\.deepseekcode\\output-styles\\brief.md",
    },
  ], "brief");

  assert.equal(model.title, "Output styles");
  assert.equal(model.rows.find((row) => row.name === "project/brief")?.status, "current");
  assert.equal(model.rows.find((row) => row.name === "project/brief")?.tone, "success");
  assert.match(model.footer, /output-style set/);
});

test("output style detail panel includes prompt preview", () => {
  const model = outputStyleDetailPanelModel({
    name: "reviewer",
    scope: "builtin",
    description: "Review mode",
    prompt: "Find bugs\nList risks\nKeep summary short",
  }, "reviewer");

  assert.equal(model.rows[0]?.status, "current");
  assert.deepEqual(model.preview, ["Find bugs", "List risks", "Keep summary short"]);
});

test("output style validation panel surfaces errors and warnings", () => {
  const model = outputStyleValidationPanelModel([
    {
      name: "broken",
      path: "D:\\project\\broken.md",
      ok: false,
      errors: ["empty output style prompt"],
      warnings: ["missing description"],
    },
  ]);

  assert.equal(model.rows[0]?.status, "failed");
  assert.equal(model.rows[0]?.tone, "error");
  assert.match(model.rows[0]?.note ?? "", /empty output style prompt/);
  assert.match(model.rows[0]?.note ?? "", /missing description/);
});
