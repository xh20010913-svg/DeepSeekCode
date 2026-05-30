import test from "node:test";
import assert from "node:assert/strict";
import {
  compactWelcomePath,
  formatWelcomeRuntimeStatus,
  welcomeActionRows,
} from "./WelcomePanel.js";

test("welcome action rows lead with diagnostics when provider is missing", () => {
  const rows = welcomeActionRows(false);
  assert.equal(rows[0]?.group, "setup");
  assert.equal(rows[0]?.command, "/doctor");
  assert.ok(rows.some((row) => row.command === "/cache plan <goal>"));
});

test("welcome action rows lead with status when provider is ready", () => {
  const rows = welcomeActionRows(true);
  assert.equal(rows[0]?.group, "status");
  assert.equal(rows[0]?.command, "/status");
});

test("welcome path compaction preserves useful suffix", () => {
  assert.equal(compactWelcomePath("D:\\code\\DeepSeekCode", 80), "D:\\code\\DeepSeekCode");
  assert.equal(compactWelcomePath("D:\\very\\long\\path\\DeepSeekCode", 16), "...\\DeepSeekCode");
});

test("welcome runtime status is compact and scan-friendly", () => {
  assert.equal(
    formatWelcomeRuntimeStatus({
      model: "deepseek-v4-flash",
      permissionProfile: "safe",
      shellEnabled: false,
      browserEnabled: true,
    }),
    "model deepseek-v4-flash  profile safe  shell off  browser on",
  );
});
