import test from "node:test";
import assert from "node:assert/strict";
import {
  toolProgressModel,
  toolProgressStatusLabel,
  toolProgressTone,
} from "./ToolProgress.js";

test("tool progress model uses Claude-style compact status labels", () => {
  assert.deepEqual(toolProgressModel({
    name: "run_command",
    status: "running",
    detail: "npm test",
  }), {
    name: "run_command",
    status: "running",
    statusLabel: "running",
    tone: "warning",
    detail: "npm test",
  });

  assert.equal(toolProgressStatusLabel("succeeded"), "done");
  assert.equal(toolProgressTone("failed"), "error");
});

test("tool progress model sanitizes blank names and clips details", () => {
  assert.deepEqual(toolProgressModel({
    name: "   ",
    status: "queued",
    detail: "writing a very long generated artifact",
    detailWidth: 14,
  }), {
    name: "tool",
    status: "queued",
    statusLabel: "queued",
    tone: "muted",
    detail: "writing a v...",
  });
});
