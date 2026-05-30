import test from "node:test";
import assert from "node:assert/strict";
import { buildStatusNoticeRows } from "./StatusNoticePanel.js";

test("status notices lead with provider setup when DeepSeek is missing", () => {
  const rows = buildStatusNoticeRows({
    providerReady: false,
    permissionProfile: "safe",
    shellEnabled: false,
    browserEnabled: false,
  });

  assert.equal(rows[0]?.id, "provider");
  assert.equal(rows[0]?.tone, "warning");
  assert.match(rows[0]?.text ?? "", /DEEPSEEK_API_KEY/);
});

test("status notices warn when privileged access is enabled", () => {
  const rows = buildStatusNoticeRows({
    providerReady: true,
    permissionProfile: "browser",
    shellEnabled: false,
    browserEnabled: true,
  });

  assert.equal(rows[0]?.id, "permissions");
  assert.equal(rows[0]?.tone, "warning");
  assert.match(rows[0]?.text ?? "", /browser access enabled/);
  assert.equal(rows[1]?.id, "cache");
});

test("status notices mark open permissions as high risk", () => {
  const rows = buildStatusNoticeRows({
    providerReady: true,
    permissionProfile: "open",
    shellEnabled: true,
    browserEnabled: true,
  });

  assert.equal(rows[0]?.state, "error");
  assert.equal(rows[0]?.tone, "error");
  assert.match(rows[0]?.text ?? "", /shell\+browser/);
});
