import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserSessionRegistry } from "./browserSessions.js";
import { startBrowserSession } from "../tools/browser.js";

test("BrowserSessionRegistry persists declared browser sessions", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-browser-"));
  const message = startBrowserSession("https://example.com", false, {
    allowBrowser: true,
    dataDir,
  });
  assert.match(message, /browser_/);
  const sessions = new BrowserSessionRegistry(dataDir).list();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.url, "https://example.com");
  assert.equal(sessions[0]?.status, "declared");
});
