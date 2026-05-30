import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTool } from "../../Tool.js";
import { StateStore } from "../../state/sqlite.js";
import { requireApprovalForToolAction, resultRequiresApproval } from "./approvalPolicy.js";
import { McpCallActionSchema } from "../../protocol/actions.js";
import { baseTools } from "../../tools/registry.js";

test("approval policy redacts typed browser text from gate summaries", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-approval-policy-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({
    projectPath: dataDir,
    model: "deepseek-v4-flash",
    message: "approval policy",
  });
  const tool = baseTools.find((candidate) => candidate.name === "browser_type");
  assert.ok(tool);

  const result = requireApprovalForToolAction(
    { state, runId, mode: "manual" },
    tool,
    {
      type: "browser_type",
      url: "https://example.com",
      selector: "#token",
      text: "secret-token-value",
    },
    { root: dataDir, allowShell: false, allowBrowser: true },
  );

  assert.ok(result);
  assert.equal(resultRequiresApproval(result), true);
  const gate = state.listApprovalGates({ status: "pending" })[0];
  assert.match(gate?.summary ?? "", /textChars=18/);
  assert.doesNotMatch(gate?.summary ?? "", /secret-token-value/);
  state.close();
});

test("approval policy summarizes MCP calls with server tool and argument metadata", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-approval-policy-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({
    projectPath: dataDir,
    model: "deepseek-v4-flash",
    message: "mcp approval policy",
  });
  const tool = buildTool({
    name: "mcp_call",
    displayName: "MCP",
    description: "test mcp tool",
    inputSchema: McpCallActionSchema,
    destructive: true,
    run(input) {
      return {
        result: {
          action_type: input.type,
          status: "succeeded",
        },
      };
    },
  });

  const result = requireApprovalForToolAction(
    { state, runId, mode: "manual" },
    tool,
    {
      type: "mcp_call",
      server: "filesystem",
      tool: "writeFile",
      arguments: { path: "a.txt", content: "hello" },
      timeout_ms: 10_000,
    },
    { root: dataDir, allowShell: true, allowBrowser: false },
  );

  assert.ok(result);
  assert.equal(resultRequiresApproval(result), true);
  const gate = state.listApprovalGates({ status: "pending" })[0];
  assert.match(gate?.summary ?? "", /mcp_call server=filesystem/);
  assert.match(gate?.summary ?? "", /tool=writeFile/);
  assert.match(gate?.summary ?? "", /argumentKeys=2/);
  assert.match(gate?.summary ?? "", /timeoutMs=10000/);
  assert.match(gate?.summary ?? "", /sha=[a-f0-9]{12}/);
  state.close();
});
