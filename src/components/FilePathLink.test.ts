import test from "node:test";
import assert from "node:assert/strict";
import {
  filePathLinkModel,
  isLikelyLocalPath,
} from "./FilePathLink.js";

test("file path link model builds file urls without changing visible text", () => {
  const model = filePathLinkModel("D:\\code\\DeepSeekCode\\src\\index.ts");

  assert.equal(model.href, "file:///D:/code/DeepSeekCode/src/index.ts");
  assert.equal(model.label, "D:\\code\\DeepSeekCode\\src\\index.ts");
  assert.equal(model.linkedText, model.label);
});

test("file path link model can emit opt-in OSC8 links", () => {
  const model = filePathLinkModel("D:\\code\\DeepSeekCode\\README.md", "README.md", { osc8: true });

  assert.match(model.linkedText, /^\u001B]8;;file:\/\/\/D:\/code\/DeepSeekCode\/README.md/);
  assert.match(model.linkedText, /README\.md/);
});

test("file path detector recognizes common local paths", () => {
  assert.equal(isLikelyLocalPath("D:\\code\\DeepSeekCode"), true);
  assert.equal(isLikelyLocalPath("/tmp/project"), true);
  assert.equal(isLikelyLocalPath("\\\\server\\share"), true);
  assert.equal(isLikelyLocalPath("deepseek-v4-flash"), false);
});
