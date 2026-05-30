import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { safeJoin } from "./pathSafety.js";

test("safeJoin keeps paths inside the project root", () => {
  const root = path.resolve("tmp-project");
  assert.equal(safeJoin(root, "src/index.ts"), path.join(root, "src", "index.ts"));
});

test("safeJoin rejects traversal", () => {
  const root = path.resolve("tmp-project");
  assert.throws(() => safeJoin(root, "../outside.txt"), /traversal|escapes/);
});

test("safeJoin rejects absolute paths", () => {
  const root = path.resolve("tmp-project");
  assert.throws(() => safeJoin(root, path.resolve("elsewhere.txt")), /absolute/);
});
