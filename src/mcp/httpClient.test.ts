import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { callMcpHttpTool, probeMcpHttpServer } from "./httpClient.js";

test("MCP HTTP client initializes, lists tools, and calls a tool", async () => {
  const server = createFakeHttpMcpServer("json");
  const url = await listen(server);
  try {
    const probe = await probeMcpHttpServer(url, 5_000);
    assert.equal(probe.tools.length, 1);
    assert.match(JSON.stringify(probe.server), /fake-http-mcp/);

    const call = await callMcpHttpTool(url, "echo", { text: "hello-http" }, 5_000);
    assert.match(JSON.stringify(call.result), /hello-http/);
  } finally {
    server.close();
  }
});

test("MCP HTTP client accepts simple SSE JSON-RPC responses", async () => {
  const server = createFakeHttpMcpServer("sse");
  const url = await listen(server);
  try {
    const probe = await probeMcpHttpServer(url, 5_000);
    assert.equal(probe.tools.length, 1);
  } finally {
    server.close();
  }
});

function createFakeHttpMcpServer(mode: "json" | "sse"): http.Server {
  return http.createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const message = JSON.parse(body);
      if (!message.id) {
        response.writeHead(202).end();
        return;
      }
      let result: unknown;
      if (message.method === "initialize") {
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "fake-http-mcp", version: "0.0.1" },
        };
      } else if (message.method === "tools/list") {
        result = { tools: [{ name: "echo", description: "Echo text" }] };
      } else if (message.method === "tools/call") {
        result = { content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }] };
      } else {
        writeResponse(response, mode, { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "not found" } });
        return;
      }
      writeResponse(response, mode, { jsonrpc: "2.0", id: message.id, result });
    });
  });
}

function writeResponse(response: http.ServerResponse, mode: "json" | "sse", payload: unknown): void {
  if (mode === "sse") {
    response.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "session-test" });
    response.end(`data: ${JSON.stringify(payload)}\n\n`);
    return;
  }
  response.writeHead(200, { "content-type": "application/json", "mcp-session-id": "session-test" });
  response.end(JSON.stringify(payload));
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
