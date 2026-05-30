import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserTrajectoryRecorder } from "./browserTrajectory.js";

test("browser trajectory recorder persists redacted browser actions", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-browser-trajectory-"));
  const recorder = new BrowserTrajectoryRecorder(dataDir);

  recorder.record({
    action: "type",
    source: "tool",
    url: "https://example.com/login",
    selector: "#password",
    status: "succeeded",
    message: "typed; textChars=12",
  });
  recorder.record({
    action: "screenshot",
    source: "command",
    url: "https://example.com",
    path: "artifacts/home.png",
    status: "succeeded",
    bytes: 1234,
  });

  const rendered = recorder.render(5);
  assert.match(rendered, /succeeded command screenshot https:\/\/example\.com/);
  assert.match(rendered, /path=artifacts\/home\.png/);
  assert.match(rendered, /selector=#password/);
  assert.doesNotMatch(rendered, /secret|password123/);
  assert.equal(recorder.list(1).length, 1);
});
