import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { buildTool } from "../Tool.js";
import {
  commandOutputPanelModel,
  shellPanelModel,
  toolDetailPanelModel,
  toolsPanelModel,
  validationPanelModel,
} from "./OperationPanel.js";

const sampleTool = buildTool({
  name: "run_command",
  displayName: "Bash",
  description: "Run a shell command.",
  inputSchema: z.object({ type: z.string() }),
  permissions: (_input, context) => context.allowShell ? { behavior: "allow" } : { behavior: "deny" },
  run: () => ({ result: { action_type: "run_command", status: "succeeded", message: "ok" } }),
});

test("tools panel marks denied permission-sensitive tools", () => {
  const model = toolsPanelModel([sampleTool], {
    root: "D:\\project",
    allowShell: false,
    allowBrowser: false,
  });

  assert.equal(model.badge, "1");
  assert.equal(model.badgeTone, "warning");
  assert.match(model.rows[0]?.note ?? "", /permission=deny/);
});

test("tool detail panel exposes description and permission state", () => {
  const model = toolDetailPanelModel(sampleTool, {
    root: "D:\\project",
    allowShell: true,
    allowBrowser: false,
  });

  assert.equal(model.badge, "enabled");
  assert.equal(model.badgeTone, "success");
  assert.equal(model.rows.some((row) => row.key === "description"), true);
});

test("validation panel summarizes failed and pending gates", () => {
  const model = validationPanelModel([
    {
      id: "validation_1",
      runId: "run_1",
      subjectType: "artifact",
      subjectId: "index.html",
      status: "failed",
      summary: "broken html",
      createdAtMs: 1,
      updatedAtMs: 1,
    },
  ], "run_1");

  assert.equal(model.badge, "failed");
  assert.equal(model.badgeTone, "error");
  assert.match(model.rows[0]?.note ?? "", /broken html/);
});

test("shell and command output panels show permission and exit state", () => {
  const shell = shellPanelModel({
    allowShell: true,
    allowBrowser: false,
    profile: "custom",
  });
  assert.equal(shell.badge, "on");
  assert.equal(shell.badgeTone, "warning");

  const output = commandOutputPanelModel("node --version", {
    cwd: "D:\\project",
    exitCode: 0,
    stdout: "v22.0.0\n",
    stderr: "",
    timedOut: false,
  });
  assert.equal(output.badge, "exit 0");
  assert.equal(output.badgeTone, "success");
  assert.equal(output.rows.some((row) => row.key === "stdout"), true);
});
