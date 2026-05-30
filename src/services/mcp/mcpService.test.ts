import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { McpService } from "./mcpService.js";

test("McpService manages local MCP server configuration", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-project-"));
  const service = new McpService(projectPath);
  const stdio = service.addStdio({
    name: "File System",
    command: "npx -y @modelcontextprotocol/server-filesystem .",
  });
  assert.equal(stdio.name, "file-system");
  assert.equal(service.validate("file-system")[0]?.ok, true);
  assert.equal(service.setEnabled("file-system", false)?.enabled, false);
  assert.match(fs.readFileSync(path.join(projectPath, ".deepseekcode", "mcp.json"), "utf8"), /file-system/);

  const http = service.addHttp({ name: "Search", url: "https://example.com/mcp" });
  assert.equal(http.type, "http");
  assert.equal(service.remove("search"), true);
  assert.equal(service.list().length, 1);
});

test("McpService probes and calls stdio MCP tools", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-project-"));
  const serverPath = path.join(projectPath, "fake-mcp.js");
  fs.writeFileSync(serverPath, fakeMcpServerSource(), "utf8");
  const service = new McpService(projectPath);
  service.addStdio({
    name: "fake",
    command: `node "${serverPath}"`,
  });
  const probe = await service.probe("fake", { allowShell: true, timeoutMs: 5_000 });
  assert.equal(probe.tools.length, 1);
  const call = await service.callTool("fake", "echo", { text: "from service" }, { allowShell: true, timeoutMs: 5_000 });
  assert.match(JSON.stringify(call.result), /from service/);
});

test("McpService probes and calls HTTP MCP tools without shell permission", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-project-"));
  const server = createFakeHttpMcpServer();
  const url = await listen(server);
  try {
    const service = new McpService(projectPath);
    service.addHttp({ name: "remote", url });
    const probe = await service.probe("remote", { allowShell: false, timeoutMs: 5_000 });
    assert.equal(probe.tools.length, 1);
    const call = await service.callTool("remote", "echo", { text: "from-http" }, { allowShell: false, timeoutMs: 5_000 });
    assert.match(JSON.stringify(call.result), /from-http/);
  } finally {
    server.close();
  }
});

test("McpService health retries transient HTTP MCP probe failures", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-project-"));
  let failures = 1;
  const server = createFakeHttpMcpServer([], () => {
    if (failures > 0) {
      failures -= 1;
      return true;
    }
    return false;
  });
  const url = await listen(server);
  try {
    const service = new McpService(projectPath);
    service.addHttp({ name: "remote", url });
    const health = await service.health("remote", {
      allowShell: false,
      timeoutMs: 5_000,
      attempts: 2,
      backoffMs: 0,
    });
    assert.equal(health[0]?.status, "ok");
    assert.equal(health[0]?.attempts, 2);
    assert.equal(health[0]?.toolCount, 1);
  } finally {
    server.close();
  }
});

test("McpService health reports disabled and failed servers without throwing", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-project-"));
  const service = new McpService(projectPath);
  service.addHttp({ name: "disabled", url: "http://127.0.0.1:1" });
  service.addHttp({ name: "missing", url: "http://127.0.0.1:1" });
  service.setEnabled("disabled", false);
  const health = await service.health(undefined, {
    allowShell: false,
    timeoutMs: 100,
    attempts: 1,
    backoffMs: 0,
  });
  assert.equal(health.find((result) => result.name === "disabled")?.status, "disabled");
  assert.equal(health.find((result) => result.name === "missing")?.status, "failed");
});

test("McpService keeps explicit HTTP MCP sessions until closed", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-mcp-project-"));
  const requests: string[] = [];
  const server = createFakeHttpMcpServer(requests);
  const url = await listen(server);
  try {
    const service = new McpService(projectPath);
    service.addHttp({ name: "remote", url });
    const connected = await service.connect("remote", { allowShell: false, timeoutMs: 5_000 });
    assert.equal(connected.tools.length, 1);
    assert.equal(service.sessions()[0]?.name, "remote");
    await service.callTool("remote", "echo", { text: "pooled" }, { allowShell: false, timeoutMs: 5_000 });
    assert.equal(requests.filter((method) => method === "initialize").length, 1);
    assert.equal(service.closeSession("remote"), 1);
    assert.equal(service.sessions().length, 0);
  } finally {
    server.close();
  }
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
    if (message.method === "initialize") send(message.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake" } });
    else if (message.method === "tools/list") send(message.id, { tools: [{ name: "echo", description: "Echo text" }] });
    else if (message.method === "tools/call") send(message.id, { content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }] });
  }
});
function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`;
}

function createFakeHttpMcpServer(requests: string[] = [], shouldFail?: () => boolean): http.Server {
  return http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      if (shouldFail?.()) {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("temporary failure");
        return;
      }
      const message = JSON.parse(body);
      requests.push(message.method);
      if (!message.id) {
        response.writeHead(202).end();
        return;
      }
      const result = message.method === "initialize"
        ? { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-http" } }
        : message.method === "tools/list"
          ? { tools: [{ name: "echo", description: "Echo text" }] }
          : { content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }] };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing test server address");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
