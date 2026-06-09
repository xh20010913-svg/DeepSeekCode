import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextCapsuleFromMessages,
  formatContextCapsule,
  parseContextCapsule,
} from "../compact/contextCapsule.js";

test("context capsule extracts Chinese goals, blockers, artifacts, and next steps", () => {
  const capsule = buildContextCapsuleFromMessages([
    { role: "user", content: "\u7ee7\u7eed\u4fee\u590d PDF \u9879\u76ee\u6587\u6863\u751f\u6210" },
    { role: "assistant", content: "\u5df2\u521b\u5efa docs/report.pdf\uff0c\u4f46 verify_task \u672a\u901a\u8fc7\uff0c\u9700\u8981\u4fee\u590d\u9a8c\u6536" },
    { role: "tool", content: "verify_task failed: missing PDF text evidence" },
  ] as any, { maxItemsPerSection: 4, maxItemChars: 180 });

  assert.equal(capsule.userGoals.length, 1);
  assert.ok(capsule.completedFacts.some((item) => item.includes("docs/report.pdf")));
  assert.ok(capsule.blockers.some((item) => item.includes("verify_task")));
  assert.deepEqual(capsule.keyArtifacts, ["docs/report.pdf"]);
  assert.ok(capsule.nextSteps.length >= 1);
  assert.equal(capsule.recentToolSummaries.length, 1);
});

test("context capsule round trips readable section headers", () => {
  const text = formatContextCapsule({
    userGoals: ["\u751f\u6210 PDF"],
    completedFacts: ["\u5df2\u542f\u52a8\u670d\u52a1"],
    blockers: ["\u6309\u94ae\u65e0\u54cd\u5e94"],
    keyArtifacts: ["D:/code/DeepSeekTest/report.pdf"],
    nextSteps: ["\u7ee7\u7eed\u4fee\u590d"],
    recentToolSummaries: ["verify_task failed"],
  });
  const parsed = parseContextCapsule(text);

  assert.deepEqual(parsed.userGoals, ["\u751f\u6210 PDF"]);
  assert.deepEqual(parsed.keyArtifacts, ["D:/code/DeepSeekTest/report.pdf"]);
  assert.deepEqual(parsed.nextSteps, ["\u7ee7\u7eed\u4fee\u590d"]);
});
