import test from "node:test";
import assert from "node:assert/strict";
import {
  skillDetailPanelModel,
  skillListPanelModel,
  skillSearchPanelModel,
  skillValidationPanelModel,
} from "./SkillPanel.js";

test("skill list panel groups discovered skills by scope labels", () => {
  const model = skillListPanelModel([
    {
      name: "reviewer",
      scope: "project",
      path: "D:\\project\\.deepseekcode\\skills\\reviewer",
      description: "Review generated diffs",
    },
  ]);

  assert.equal(model.title, "Skills");
  assert.equal(model.rows[0]?.name, "project/reviewer");
  assert.equal(model.rows[0]?.status, "project");
  assert.equal(model.rows[0]?.tone, "success");
});

test("skill search panel marks local-only skills", () => {
  const model = skillSearchPanelModel([
    {
      name: "offline",
      scope: "project",
      path: "D:\\project\\.deepseekcode\\skills\\offline",
      description: "Local docs workflow",
      disableModelInvocation: true,
    },
  ], "docs");

  assert.equal(model.subtitle, "query: docs");
  assert.equal(model.rows[0]?.status, "local");
  assert.equal(model.rows[0]?.tone, "warning");
  assert.match(model.rows[0]?.note ?? "", /disable-model-invocation/);
});

test("skill detail panel includes skill prompt preview", () => {
  const model = skillDetailPanelModel({
    name: "writer",
    scope: "project",
    path: "D:\\project\\.deepseekcode\\skills\\writer",
    description: "Write docs",
    prompt: "---\nname: writer\ndescription: Write docs\n---\nUse this skill.\nCheck files.",
    frontmatter: {
      name: "writer",
      description: "Write docs",
    },
  });

  assert.equal(model.rows[0]?.name, "project/writer");
  assert.deepEqual(model.preview?.slice(-2), ["Use this skill.", "Check files."]);
});

test("skill validation panel surfaces errors and warnings", () => {
  const model = skillValidationPanelModel([
    {
      name: "broken",
      path: "D:\\project\\.deepseekcode\\skills\\broken",
      ok: false,
      errors: ["missing SKILL.md"],
      warnings: ["missing description"],
    },
  ]);

  assert.equal(model.rows[0]?.status, "failed");
  assert.equal(model.rows[0]?.tone, "error");
  assert.match(model.rows[0]?.note ?? "", /missing SKILL.md/);
});
