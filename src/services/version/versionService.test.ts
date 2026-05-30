import test from "node:test";
import assert from "node:assert/strict";
import { formatVersion, readVersionInfo } from "./versionService.js";

test("readVersionInfo loads package metadata", () => {
  const info = readVersionInfo();
  assert.equal(info.name, "deepseekcode");
  assert.match(info.version, /^\d+\.\d+\.\d+/);
  assert.match(formatVersion(info), /deepseekcode/);
});
