import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStorage } from "./sessionStorage.js";

test("SessionStorage writes and reads JSONL transcript records", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-session-"));
  const storage = new SessionStorage(dataDir, "session_test");
  storage.append({ role: "user", text: "hello" });
  storage.append({ role: "assistant", text: "world" });
  const rows = storage.readAll();
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.role, "user");
  assert.equal(rows[1]?.text, "world");
});
