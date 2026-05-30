import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMcpName,
  parseMcpConfig,
  renderMcpConfig,
  validateMcpServer,
} from "./config.js";

test("MCP config renders, normalizes, and validates server entries", () => {
  assert.equal(normalizeMcpName("File System MCP!"), "file-system-mcp");
  const document = renderMcpConfig({
    servers: [{
      name: "filesystem",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      env: {},
      enabled: true,
      description: "",
    }],
  });
  const config = parseMcpConfig(JSON.parse(document));
  assert.equal(config.servers[0]?.name, "filesystem");
  assert.equal(validateMcpServer(config.servers[0]!).ok, true);
  assert.equal(validateMcpServer({
    name: "remote",
    type: "http",
    args: [],
    env: {},
    enabled: true,
    description: "",
  }).ok, false);
});
