import test from "node:test";
import assert from "node:assert/strict";
import {
  mcpHealthPanelModel,
  mcpServersPanelModel,
  mcpSessionsPanelModel,
  mcpToolsPanelModel,
  mcpValidationPanelModel,
} from "./McpPanel.js";

test("MCP server panel model summarizes configured servers", () => {
  const model = mcpServersPanelModel([
    {
      name: "filesystem",
      type: "stdio",
      command: "node server.js",
      args: [],
      env: {},
      enabled: true,
      description: "",
    },
  ]);

  assert.equal(model.title, "MCP servers");
  assert.equal(model.rows[0]?.name, "filesystem");
  assert.equal(model.rows[0]?.status, "enabled");
  assert.equal(model.rows[0]?.detail, "stdio node server.js");
  assert.match(model.footer, /mcp health/);
});

test("MCP validation and health models surface failed states", () => {
  const validation = mcpValidationPanelModel([
    { name: "bad", ok: false, errors: ["missing command"], warnings: ["absolute command"] },
  ]);
  assert.equal(validation.rows[0]?.tone, "error");
  assert.match(validation.rows[0]?.detail ?? "", /missing command/);
  assert.match(validation.rows[0]?.note ?? "", /warning/);

  const health = mcpHealthPanelModel([
    {
      name: "bad",
      type: "stdio",
      enabled: true,
      status: "failed",
      attempts: 2,
      latencyMs: 12,
      toolCount: 0,
      error: "spawn failed",
    },
  ]);
  assert.equal(health.rows[0]?.tone, "error");
  assert.match(health.rows[0]?.note ?? "", /spawn failed/);
});

test("MCP sessions and tools models expose operational follow-ups", () => {
  const sessions = mcpSessionsPanelModel([
    {
      name: "filesystem",
      type: "stdio",
      toolCount: 2,
      connectedAtMs: 1_700_000_000_000,
      lastUsedAtMs: 1_700_000_010_000,
    },
  ]);
  assert.equal(sessions.rows[0]?.status, "connected");
  assert.match(sessions.footer, /close/);

  const tools = mcpToolsPanelModel("filesystem", [
    {
      name: "read_file",
      description: "Read a project file",
      inputSchema: {
        properties: {
          path: { type: "string" },
        },
      },
    },
  ]);
  assert.equal(tools.rows[0]?.name, "read_file");
  assert.match(tools.rows[0]?.note ?? "", /params: path/);
  assert.match(tools.footer, /mcp call filesystem/);
});
