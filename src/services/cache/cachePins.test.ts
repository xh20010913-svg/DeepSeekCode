import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CachePinService, normalizeCachePinName } from "./cachePins.js";

test("CachePinService stores stable prompt pins safely", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-cache-pins-"));
  const service = new CachePinService(projectPath);

  assert.equal(normalizeCachePinName("Architecture"), "architecture");
  assert.equal(normalizeCachePinName("../secret"), null);
  assert.equal(service.list().length, 0);

  const pin = service.create("Architecture", "DeepSeekCode is a TypeScript CLI runtime.");
  assert.equal(pin.name, "architecture");
  assert.match(pin.path, /architecture\.md$/);
  assert.match(service.load("architecture")?.content ?? "", /TypeScript CLI/);
  assert.deepEqual(service.promptBlocks()[0], {
    title: "cache_pin_architecture",
    body: "DeepSeekCode is a TypeScript CLI runtime.\n",
    priority: "sticky",
  });
  assert.equal(service.remove("architecture"), true);
  assert.equal(service.list().length, 0);
});
