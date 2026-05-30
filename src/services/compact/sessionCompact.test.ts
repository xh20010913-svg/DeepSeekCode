import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStorage } from "../session/sessionStorage.js";
import { compactSessionTranscript, formatSessionCompactSummary } from "./sessionCompact.js";

test("compactSessionTranscript summarizes older session records and keeps tail", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-compact-"));
  const session = new SessionStorage(dataDir, "session_summary");
  for (let index = 0; index < 16; index += 1) {
    session.append({ role: index % 2 === 0 ? "user" : "assistant", text: `message ${index}` });
  }
  const summary = compactSessionTranscript(dataDir, "session_summary", 6);
  assert.equal(summary.tailRecords.length, 6);
  assert.match(summary.summary, /message 0/);
  assert.match(formatSessionCompactSummary(summary), /records: total=16/);
});
