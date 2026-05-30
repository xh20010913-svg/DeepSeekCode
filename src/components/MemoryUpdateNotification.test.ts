import test from "node:test";
import assert from "node:assert/strict";
import { relativeMemoryPath } from "./MemoryUpdateNotification.js";

test("relative memory path prefers project-relative paths", () => {
  assert.equal(
    relativeMemoryPath("D:\\code\\DeepSeekCode\\.deepseekcode\\memory.md", "D:\\code\\DeepSeekCode", "C:\\Users\\me"),
    "./.deepseekcode/memory.md",
  );
});

test("relative memory path can fall back to home-relative paths", () => {
  assert.equal(
    relativeMemoryPath("C:\\Users\\me\\.deepseekcode\\memory.md", "D:\\code\\DeepSeekCode", "C:\\Users\\me"),
    "~/.deepseekcode/memory.md",
  );
});

test("relative memory path leaves unrelated paths unchanged", () => {
  assert.equal(
    relativeMemoryPath("E:\\other\\memory.md", "D:\\code\\DeepSeekCode", "C:\\Users\\me"),
    "E:\\other\\memory.md",
  );
});
