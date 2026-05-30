import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callMcpStdioTool, probeMcpStdioServer } from "./stdioClient.js";

test("MCP stdio client initializes, lists tools, and calls a tool", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-stdio-"));
  const serverPath = path.join(root, "fake-mcp.js");
  fs.writeFileSync(serverPath, fakeMcpServerSource(), "utf8");

  const probe = await probeMcpStdioServer(`node "${serverPath}"`, root, 5_000);
  assert.equal(probe.tools.length, 1);
  assert.match(JSON.stringify(probe.server), /fake-mcp/);

  const call = await callMcpStdioTool(`node "${serverPath}"`, root, "echo", { text: "hello" }, 5_000);
  assert.match(JSON.stringify(call.result), /hello/);
});

function fakeMcpServerSource(): string {
  return `
let buffer = "";
process.stdin.on("data", chunk => {
  buffer += chunk.toString();
  const parts = buffer.split(/\\r?\\n/);
  buffer = parts.pop() || "";
  for (const part of parts) {
    if (!part.trim()) continue;
    const message = JSON.parse(part);
    if (!message.id) continue;
    if (message.method === "initialize") {
      send(message.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-mcp", version: "0.0.1" }
      });
    } else if (message.method === "tools/list") {
      send(message.id, {
        tools: [{ name: "echo", description: "Echo text", inputSchema: { type: "object" } }]
      });
    } else if (message.method === "tools/call") {
      send(message.id, {
        content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }],
        isError: false
      });
    } else {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "not found" } }) + "\\n");
    }
  }
});
function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`;
}
