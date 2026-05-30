import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewPrompt } from "./reviewPrompt.js";

test("buildReviewPrompt creates code and security review prompts", () => {
  const code = buildReviewPrompt({ mode: "code", diff: "+hello", source: "git diff" });
  assert.match(code, /expert code reviewer/);
  assert.match(code, /Findings ordered by severity|findings ordered by severity/i);

  const security = buildReviewPrompt({ mode: "security", diff: "+eval", source: "git diff" });
  assert.match(security, /senior security reviewer/);
  assert.match(security, /confidence/);
});
