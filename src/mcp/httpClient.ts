import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpProbeResult } from "./stdioClient.js";

export class McpHttpClient {
  private nextId = 1;
  private sessionId = "";

  constructor(
    private readonly url: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async connect(): Promise<unknown> {
    const result = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "deepseekcode",
        version: "0.1.0",
      },
    });
    await this.notify("notifications/initialized", {});
    return result;
  }

  async listTools(): Promise<unknown[]> {
    const result = await this.request("tools/list", {});
    if (isRecord(result) && Array.isArray(result.tools)) return result.tools;
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", {
      name,
      arguments: args,
    });
  }

  close(): void {
    this.sessionId = "";
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const response = await this.post({ jsonrpc: "2.0", id, method, params });
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await this.post({ jsonrpc: "2.0", method, params }, true);
  }

  private async post(
    message: JsonRpcRequest | JsonRpcNotification,
    notification = false,
  ): Promise<JsonRpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "mcp-protocol-version": "2024-11-05",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      const session = response.headers.get("mcp-session-id");
      if (session) this.sessionId = session;
      if (notification && (response.status === 202 || response.status === 204)) {
        return { jsonrpc: "2.0", id: 0, result: null };
      }
      if (!response.ok) throw new Error(`MCP HTTP request failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (!text.trim()) return { jsonrpc: "2.0", id: 0, result: null };
      const parsed = response.headers.get("content-type")?.includes("text/event-stream")
        ? parseSseJsonRpc(text)
        : JSON.parse(text);
      if (Array.isArray(parsed)) {
        const id = isRecord(message) && typeof message.id === "number" ? message.id : 0;
        return parsed.find((entry) => isRecord(entry) && entry.id === id) as JsonRpcResponse;
      }
      return parsed as JsonRpcResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function probeMcpHttpServer(
  url: string,
  timeoutMs = 10_000,
): Promise<McpProbeResult> {
  const client = new McpHttpClient(url, timeoutMs);
  const server = await client.connect();
  const tools = await client.listTools();
  return {
    server,
    tools,
    stderr: "",
  };
}

export async function callMcpHttpTool(
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ result: unknown; stderr: string }> {
  const client = new McpHttpClient(url, timeoutMs);
  await client.connect();
  const result = await client.callTool(toolName, args);
  return { result, stderr: "" };
}

function parseSseJsonRpc(text: string): unknown {
  const events: string[] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.length > 0) {
        events.push(current.join("\n"));
        current = [];
      }
      continue;
    }
    if (line.startsWith("data:")) current.push(line.slice("data:".length).trimStart());
  }
  if (current.length > 0) events.push(current.join("\n"));
  const parsed = events.map((event) => JSON.parse(event));
  return parsed.length === 1 ? parsed[0] : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
