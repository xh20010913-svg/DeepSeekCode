import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHighlightedCodeLine,
  highlightedCodeModel,
  inferCodeLanguage,
} from "./HighlightedCode.js";

test("highlighted code infers common code fence and file languages", () => {
  assert.equal(inferCodeLanguage("typescript"), "typescript");
  assert.equal(inferCodeLanguage("src/index.ts"), "typescript");
  assert.equal(inferCodeLanguage("patch.diff"), "diff");
  assert.equal(inferCodeLanguage("powershell"), "shell");
});

test("highlighted code model renders line gutters and clips content width", () => {
  const model = highlightedCodeModel("const value = 'abcdef';", "example.ts", 16);

  assert.equal(model.language, "typescript");
  assert.equal(model.gutterWidth, 3);
  assert.equal(model.lines[0]?.gutter, "1  ");
  assert.equal(model.lines[0]?.text.length <= model.contentWidth, true);
  assert.equal(model.lines[0]?.color, "yellow");
});

test("highlighted code classifies diff and comment lines", () => {
  assert.equal(classifyHighlightedCodeLine("+added", "diff").color, "green");
  assert.equal(classifyHighlightedCodeLine("// note", "typescript").dim, true);
  assert.equal(classifyHighlightedCodeLine("npm run build", "shell").color, "cyan");
});
