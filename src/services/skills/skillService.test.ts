import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SkillService } from "./skillService.js";

test("SkillService creates and validates project skills", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-data-"));
  const service = new SkillService(projectPath, dataDir);
  const skill = service.createProjectSkill({
    name: "Code Review",
    description: "Review generated diffs",
  });
  assert.equal(skill.name, "code-review");
  assert.match(skill.prompt, /description: Review generated diffs/);
  assert.equal(service.validate("code-review")[0]?.ok, true);
  assert.throws(() => service.createProjectSkill({
    name: "code-review",
    description: "duplicate",
  }), /already exists/);
});

test("SkillService installs, searches, updates, and uninstalls local skill packs", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-data-"));
  const sourcePath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-source-"));
  fs.mkdirSync(path.join(sourcePath, "node_modules", "skip-me"), { recursive: true });
  fs.writeFileSync(path.join(sourcePath, "SKILL.md"), [
    "---",
    "name: Writer",
    "description: Draft release notes",
    "---",
    "Write concise release notes.",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(sourcePath, "node_modules", "skip-me", "index.js"), "module.exports = 1;\n", "utf8");

  const service = new SkillService(projectPath, dataDir);
  const skill = service.installFromPath({ sourcePath, name: "release-writer" });
  assert.equal(skill.name, "release-writer");
  assert.equal(fs.existsSync(path.join(skill.path, "node_modules")), false);
  assert.equal(service.source("release-writer")?.sourcePath, path.resolve(sourcePath));
  assert.match(service.search("release notes")[0]?.name ?? "", /release-writer/);
  const installedAtMs = service.source("release-writer")?.installedAtMs;

  fs.writeFileSync(path.join(sourcePath, "SKILL.md"), [
    "---",
    "name: Writer",
    "description: Draft updated release notes",
    "---",
    "Write updated release notes.",
    "",
  ].join("\n"), "utf8");
  const updated = service.update("release-writer");
  assert.match(updated.prompt, /updated release notes/);
  assert.equal(service.source("release-writer")?.installedAtMs, installedAtMs);
  assert.ok(service.source("release-writer")?.updatedAtMs);

  const removedPath = service.uninstall("release-writer");
  assert.equal(fs.existsSync(removedPath), false);
});
