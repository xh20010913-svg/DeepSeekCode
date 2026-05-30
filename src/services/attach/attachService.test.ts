import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { AttachService } from "./attachService.js";

test("AttachService lists and persists attached unfinished runs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-attach-"));
  const state = new StateStore(path.join(dir, "state.sqlite"));
  const running = state.createRun({ projectPath: dir, model: "deepseek-v4-flash", message: "running" });
  const done = state.createRun({ projectPath: dir, model: "deepseek-v4-flash", message: "done" });
  state.updateRunStatus(done, "succeeded", "done");

  const service = new AttachService(state, dir);
  assert.deepEqual(service.listUnfinished().map((run) => run.id), [running]);
  assert.equal(service.attachLatest().id, running);
  assert.equal(service.current().runId, running);
  service.clear();
  assert.equal(service.current().runId, undefined);
  state.close();
});
