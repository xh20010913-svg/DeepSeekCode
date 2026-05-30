import test from "node:test";
import assert from "node:assert/strict";
import { parseToolStartText } from "./ToolStartMessage.js";

test("tool start parser extracts tool name and target detail", () => {
  assert.deepEqual(parseToolStartText("run_command started npm test"), {
    name: "run_command",
    detail: "npm test",
  });
  assert.deepEqual(parseToolStartText("write_file started src/index.ts"), {
    name: "write_file",
    detail: "src/index.ts",
  });
});

test("tool start parser handles unknown lines and truncates wide detail", () => {
  assert.deepEqual(parseToolStartText("custom thing happened", 8), {
    name: "tool",
    detail: "custo...",
  });
  assert.deepEqual(parseToolStartText("grep started 你好世界", 9), {
    name: "grep",
    detail: "你好世界",
  });
});
