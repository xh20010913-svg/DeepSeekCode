import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../state/sqlite.js";
import { resumeSession } from "./resumeService.js";
import { getSessionTitle, setSessionTitle } from "./sessionMetadata.js";
import { SessionStorage } from "./sessionStorage.js";

test("session metadata and resume focus persist locally", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-session-meta-"));
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-session-project-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  new SessionStorage(dataDir, "session_one").append({ role: "user", text: "hello" });

  setSessionTitle(dataDir, "session_one", "First Session");
  assert.equal(getSessionTitle(dataDir, "session_one"), "First Session");
  const preview = resumeSession(state, dataDir, projectPath, "session_one");
  assert.equal(preview.title, "First Session");
  assert.equal(preview.records[0]?.text, "hello");
  state.close();
});
