import test from "node:test";
import assert from "node:assert/strict";
import {
  contextFilesPanelModel,
  contextMapPanelModel,
  contextPromptPanelModel,
} from "./ContextPanel.js";

const bundle = {
  repositoryMap: {
    root: "D:\\project",
    files: [
      { path: "package.json", size: 100, ext: ".json" },
      { path: "src/index.ts", size: 200, ext: ".ts" },
    ],
    truncated: false,
  },
  selectedFiles: [{
    path: "src/index.ts",
    content: "console.log('ok')",
    truncated: false,
    score: 55,
  }],
  approxTokens: 4,
};

test("context map panel marks selected files", () => {
  const model = contextMapPanelModel(bundle);

  assert.equal(model.rows.length, 2);
  assert.equal(model.rows.find((row) => row.name === "src/index.ts")?.tone, "brand");
  assert.match(model.rows.find((row) => row.name === "src/index.ts")?.note ?? "", /selected/);
});

test("context files panel preserves scores and truncation state", () => {
  const model = contextFilesPanelModel(bundle, "ui");

  assert.match(model.subtitle, /goal: ui/);
  assert.equal(model.rows[0]?.status, "score 55");
  assert.equal(model.rows[0]?.tone, "success");
  assert.equal(model.suggestions?.[0]?.severity, "success");
});

test("context prompt panel includes clipped prompt preview", () => {
  const model = contextPromptPanelModel(bundle, "<file>\nhello\n</file>");

  assert.deepEqual(model.preview?.slice(0, 2), ["<file>", "hello"]);
});

test("context panels surface cache and truncation suggestions", () => {
  const model = contextFilesPanelModel({
    ...bundle,
    selectedFiles: [{
      path: "src/large.ts",
      content: "x".repeat(200),
      truncated: true,
      score: 70,
    }],
    approxTokens: 55_000,
  }, "refactor ui");

  assert.equal(model.suggestions?.some((suggestion) => suggestion.title === "Some excerpts are truncated"), true);
  assert.equal(model.suggestions?.some((suggestion) => suggestion.title === "Context is too large"), true);
  assert.match(model.suggestions?.find((suggestion) => suggestion.command === "/cache plan <goal>")?.detail ?? "", /cache reuse/);
});

test("context map suggests selecting files when prompt context is empty", () => {
  const model = contextMapPanelModel({
    ...bundle,
    selectedFiles: [],
    approxTokens: 0,
  });

  assert.equal(model.suggestions?.[0]?.title, "No prompt files selected");
  assert.equal(model.suggestions?.[0]?.command, "/files <goal>");
});
