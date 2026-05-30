import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuickOpenItems,
  normalizeQuickOpenQuery,
  quickOpenMentionText,
  quickOpenPathText,
  type QuickOpenFile,
} from "./quickOpen.js";

const files: QuickOpenFile[] = [
  { path: "src/components/Workbench.tsx", size: 12000, ext: ".tsx" },
  { path: "src/prompt/quickOpen.ts", size: 3200, ext: ".ts" },
  { path: "docs/CLAUDE_CODE_REUSE_MAP.md", size: 2400, ext: ".md" },
  { path: "package.json", size: 900, ext: ".json" },
];

test("quick open returns files in deterministic order for empty query", () => {
  assert.deepEqual(
    getQuickOpenItems(files, "").map((item) => item.path),
    [
      "docs/CLAUDE_CODE_REUSE_MAP.md",
      "package.json",
      "src/prompt/quickOpen.ts",
      "src/components/Workbench.tsx",
    ],
  );
});

test("quick open ranks name path extension and fuzzy matches", () => {
  assert.deepEqual(
    getQuickOpenItems(files, "work").map((item) => item.path),
    ["src/components/Workbench.tsx"],
  );
  assert.deepEqual(
    getQuickOpenItems(files, "components").map((item) => item.path),
    ["src/components/Workbench.tsx"],
  );
  assert.deepEqual(
    getQuickOpenItems(files, "md").map((item) => item.path),
    ["docs/CLAUDE_CODE_REUSE_MAP.md"],
  );
  assert.deepEqual(
    getQuickOpenItems(files, "qop").map((item) => item.path),
    ["src/prompt/quickOpen.ts"],
  );
});

test("quick open normalizes mention input and creates insert text", () => {
  assert.equal(normalizeQuickOpenQuery("@src\\prompt"), "src/prompt");
  const [item] = getQuickOpenItems(files, "quickOpen");
  assert.ok(item);
  assert.equal(quickOpenMentionText(item), "@src/prompt/quickOpen.ts ");
  assert.equal(quickOpenPathText(item), "src/prompt/quickOpen.ts ");
});
