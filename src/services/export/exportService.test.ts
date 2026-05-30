import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import { StateStore } from "../../state/sqlite.js";
import { exportRunTrace, exportStatusSnapshot, inferExportFormat } from "./exportService.js";

test("export service writes run trace and status snapshots", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-export-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-export-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({ projectPath, model: "deepseek-v4-flash", message: "export me" });
  state.createTask({ runId, agent: "Planner", title: "Plan export" });

  const runExport = exportRunTrace(projectPath, state, runId, "exports/run.md", "markdown");
  assert.equal(fs.existsSync(runExport.path), true);
  assert.match(fs.readFileSync(runExport.path, "utf8"), new RegExp(runId));

  const config: RuntimeConfig = {
    projectPath,
    dataDir,
    stateDbPath: path.join(dataDir, "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: false,
    browserEnabled: false,
    permissionProfile: "safe",
  };
  const statusExport = exportStatusSnapshot(
    config,
    state,
    { allowShell: false, allowBrowser: false, profile: "safe" },
    "exports/status.json",
    "json",
  );
  assert.equal(inferExportFormat("x.json"), "json");
  assert.equal(JSON.parse(fs.readFileSync(statusExport.path, "utf8")).product, "DeepSeekCode");
  state.close();
});
