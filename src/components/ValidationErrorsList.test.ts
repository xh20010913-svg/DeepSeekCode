import test from "node:test";
import assert from "node:assert/strict";
import { formatInvalidValue, validationErrorsListModel } from "./ValidationErrorsList.js";

test("validation errors list groups errors by file and sorts paths", () => {
  const model = validationErrorsListModel([
    { file: "plugin.json", path: "commands.1.name", message: "missing name" },
    { file: "plugin.json", path: "agents.0", message: "missing file", severity: "warning" },
    { file: "SKILL.md", message: "missing description" },
  ]);

  assert.equal(model.count, 3);
  assert.deepEqual(model.groups.map((group) => group.file), ["plugin.json", "SKILL.md"]);
  assert.equal(model.groups.find((group) => group.file === "plugin.json")?.rows[0]?.path, "agents.0");
});

test("validation errors list formats invalid values compactly", () => {
  assert.equal(formatInvalidValue("bad"), "\"bad\"");
  assert.equal(formatInvalidValue(null), "null");
  assert.equal(formatInvalidValue({ mode: "bad" }), "{\"mode\":\"bad\"}");
});
