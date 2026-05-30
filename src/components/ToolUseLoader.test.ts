import test from "node:test";
import assert from "node:assert/strict";
import { toolUseLoaderModel } from "./ToolUseLoader.js";

test("tool use loader maps statuses to terminal-safe glyphs", () => {
  assert.deepEqual(toolUseLoaderModel("queued"), {
    glyph: ".",
    tone: "muted",
    dim: true,
    label: "queued",
  });
  assert.deepEqual(toolUseLoaderModel("succeeded"), {
    glyph: "+",
    tone: "success",
    dim: false,
    label: "done",
  });
  assert.deepEqual(toolUseLoaderModel("failed"), {
    glyph: "x",
    tone: "error",
    dim: false,
    label: "failed",
  });
});

test("tool use loader can blink running rows without changing width", () => {
  assert.equal(toolUseLoaderModel("running", true).glyph, "*");
  assert.equal(toolUseLoaderModel("running", false).glyph, " ");
  assert.equal(toolUseLoaderModel("running", false).tone, "warning");
});
