import test from "node:test";
import assert from "node:assert/strict";
import { bundledSkillAdapters, createSkillAdapter, normalizeSkillReference } from "./compat.js";

test("skill adapter normalizes bundled skill paths", () => {
  assert.equal(normalizeSkillReference("bundled/verify/SKILL.md"), "verify");
  assert.equal(normalizeSkillReference("loadSkillsDir.ts"), "loadskillsdir");
});

test("skill adapter uses DeepSeekCode descriptions", () => {
  const skill = createSkillAdapter("bundled/remember.ts");
  assert.equal(skill.name, "remember");
  assert.match(skill.description, /cache pins/);
});

test("bundled skill adapters expose local entries", () => {
  assert.equal(bundledSkillAdapters.some((skill) => skill.name === "verify"), true);
});
