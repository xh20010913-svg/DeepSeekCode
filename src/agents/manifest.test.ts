import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAgentName,
  parseAgentDocument,
  renderAgentDocument,
  validateAgentDocument,
} from "./manifest.js";

test("agent documents parse frontmatter and validate agent prompts", () => {
  assert.equal(normalizeAgentName("Code Reviewer!"), "code-reviewer");
  const document = renderAgentDocument({
    name: "Code Reviewer",
    description: "Review generated diffs",
    tools: ["read_file", "grep_files"],
    maxTurns: 3,
  });
  const parsed = parseAgentDocument(document);
  assert.equal(parsed.frontmatter.name, "code-reviewer");
  assert.equal(parsed.frontmatter.model, "inherit");
  assert.deepEqual(parsed.frontmatter.tools, ["read_file", "grep_files"]);
  assert.equal(parsed.frontmatter.maxTurns, 3);
  assert.equal(validateAgentDocument("code-reviewer", "agents/code-reviewer.md", document, ["read_file", "grep_files"]).ok, true);

  const invalid = validateAgentDocument(
    "code-reviewer",
    "agents/code-reviewer.md",
    document.replace("name: code-reviewer", "name: other"),
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0] ?? "", /does not match/);
});
