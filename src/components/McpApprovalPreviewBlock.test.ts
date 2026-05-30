import test from "node:test";
import assert from "node:assert/strict";
import { mcpApprovalPreviewModel } from "./McpApprovalPreviewBlock.js";

test("MCP approval preview summarizes server tool calls", () => {
  assert.deepEqual(mcpApprovalPreviewModel(
    "mcp_call server=filesystem tool=writeFile argumentKeys=2 timeoutMs=10000 sha=abc123",
  ), {
    action: "mcp_call",
    title: "MCP tool call",
    server: "filesystem",
    tool: "writeFile",
    argumentSummary: "2 key(s)",
    timeout: "10000 ms",
    fingerprint: "abc123",
    risk: "high",
    note: "MCP tools can perform server-defined side effects; approve only the expected server and tool",
  });
});

test("MCP approval preview ignores unrelated summaries", () => {
  assert.equal(mcpApprovalPreviewModel("run_command command=dir cwd=."), null);
});
