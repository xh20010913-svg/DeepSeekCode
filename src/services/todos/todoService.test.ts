import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TodoService, formatTodoList } from "./todoService.js";

test("TodoService stores Claude-style todo lists and clears completed lists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-todos-"));
  const service = new TodoService(root);

  const added = service.add("Inspect reference architecture", "Inspecting reference architecture");
  assert.equal(added.summary.pending, 1);
  assert.match(formatTodoList(service.list()), /\[ \] Inspect reference architecture/);

  const started = service.start("1");
  assert.equal(started.storedTodos[0]?.status, "in_progress");
  assert.match(formatTodoList(service.list()), /\[>\] Inspect reference architecture/);

  service.add("Run tests", "Running tests");
  assert.throws(() => service.writeTodos([
    { content: "A", activeForm: "Doing A", status: "in_progress" },
    { content: "B", activeForm: "Doing B", status: "in_progress" },
  ]), /at most one/);

  service.complete("1");
  const final = service.complete("2");
  assert.equal(final.cleared, true);
  assert.deepEqual(service.list(), []);
});
