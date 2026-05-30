import test from "node:test";
import assert from "node:assert/strict";
import { planApprovalPreviewModelFromContent } from "./PlanApprovalPreviewBlock.js";

test("plan approval preview summarizes markdown plan content", () => {
  assert.deepEqual(planApprovalPreviewModelFromContent([
    "# DeepSeekCode Plan run_1",
    "",
    "Goal: Port approval UI",
    "",
    "## Approach",
    "1. Add permission frame",
    "2. Add plan preview",
    "",
  ].join("\n"), ".deepseekcode/plans/run_1.md", 80, 4), {
    title: "Plan preview",
    path: ".deepseekcode/plans/run_1.md",
    size: "107 chars / 8 lines",
    preview: [
      "DeepSeekCode Plan run_1",
      "Goal: Port approval UI",
      "Approach",
      "1. Add permission frame",
    ],
    clipped: true,
  });
});
