import test from "node:test";
import assert from "node:assert/strict";
import { firstSkillDescription, parseSkillDocument, renderSkillDocument, validateSkillDocument } from "./manifest.js";

test("skill manifest frontmatter is parsed and validated", () => {
  const document = renderSkillDocument({
    name: "verify",
    description: "Verify local changes",
    disableModelInvocation: true,
  });
  const parsed = parseSkillDocument(document);
  assert.equal(parsed.frontmatter.name, "verify");
  assert.equal(parsed.frontmatter.description, "Verify local changes");
  assert.equal(parsed.frontmatter.disableModelInvocation, true);
  assert.equal(firstSkillDescription(document), "Verify local changes");
  assert.equal(validateSkillDocument("verify", "x/verify", document).ok, true);
  const invalid = validateSkillDocument("verify", "x/verify", document.replace("name: verify", "name: other"));
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0] ?? "", /does not match/);
});
