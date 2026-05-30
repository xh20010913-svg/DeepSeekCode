import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigService } from "./config/configService.js";
import { diagnosticTracker } from "./diagnosticTracking.js";
import { listNotifications, sendNotification } from "./notifier.js";
import { PermissionService } from "./permissions/permissionService.js";
import { defaultPermissionPolicy } from "../utils/permissions/policy.js";

test("service ports provide config, permissions, diagnostics and notifications", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-services-"));
  const configService = new ConfigService({
    projectPath: dataDir,
    dataDir,
    stateDbPath: path.join(dataDir, "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: false,
    browserEnabled: false,
    permissionProfile: "safe",
  });
  assert.equal(configService.update({ defaultModel: "deepseek-v4-flash" }).defaultModel, "deepseek-v4-flash");
  const permissions = new PermissionService(defaultPermissionPolicy);
  permissions.update({ allowShell: true });
  assert.equal(permissions.snapshot().allowShell, true);
  permissions.applyProfile("browser");
  assert.equal(permissions.snapshot().allowBrowser, true);
  assert.equal(permissions.snapshot().allowShell, false);
  diagnosticTracker.record("test", "ok");
  assert.equal(diagnosticTracker.list(1)[0]?.message, "ok");
  sendNotification({ title: "hello", message: "world" });
  assert.equal(listNotifications().at(-1)?.title, "hello");
});
