import type { McpServerConfig } from "./config.js";
import { McpHttpClient } from "./httpClient.js";
import type { McpProbeResult } from "./stdioClient.js";
import { McpStdioClient } from "./stdioClient.js";

type PooledClient = McpStdioClient | McpHttpClient;

export interface McpSessionSnapshot {
  name: string;
  type: McpServerConfig["type"];
  toolCount: number;
  connectedAtMs: number;
  lastUsedAtMs: number;
}

interface PooledSession {
  name: string;
  type: McpServerConfig["type"];
  client: PooledClient;
  server: unknown;
  tools: unknown[];
  connectedAtMs: number;
  lastUsedAtMs: number;
}

export class McpSessionPool {
  private readonly sessions = new Map<string, PooledSession>();

  constructor(private readonly projectPath: string) {}

  has(name: string): boolean {
    return this.sessions.has(name);
  }

  async connect(
    server: McpServerConfig,
    options: { allowShell: boolean; timeoutMs?: number },
  ): Promise<McpProbeResult> {
    const existing = this.sessions.get(server.name);
    if (existing) {
      existing.lastUsedAtMs = Date.now();
      return {
        server: existing.server,
        tools: existing.tools,
        stderr: stderrOf(existing.client),
      };
    }

    const client = createClient(this.projectPath, server, options);
    const serverInfo = await client.connect();
    const tools = await client.listTools();
    const now = Date.now();
    this.sessions.set(server.name, {
      name: server.name,
      type: server.type,
      client,
      server: serverInfo,
      tools,
      connectedAtMs: now,
      lastUsedAtMs: now,
    });
    return {
      server: serverInfo,
      tools,
      stderr: stderrOf(client),
    };
  }

  async probe(name: string): Promise<McpProbeResult> {
    const session = this.requireSession(name);
    session.tools = await session.client.listTools();
    session.lastUsedAtMs = Date.now();
    return {
      server: session.server,
      tools: session.tools,
      stderr: stderrOf(session.client),
    };
  }

  async callTool(name: string, toolName: string, args: Record<string, unknown>): Promise<{ result: unknown; stderr: string }> {
    const session = this.requireSession(name);
    const result = await session.client.callTool(toolName, args);
    session.lastUsedAtMs = Date.now();
    return {
      result,
      stderr: stderrOf(session.client),
    };
  }

  close(name?: string): number {
    if (name) {
      const session = this.sessions.get(name);
      if (!session) return 0;
      session.client.close();
      this.sessions.delete(name);
      return 1;
    }
    const count = this.sessions.size;
    for (const session of this.sessions.values()) session.client.close();
    this.sessions.clear();
    return count;
  }

  list(): McpSessionSnapshot[] {
    return [...this.sessions.values()]
      .map((session) => ({
        name: session.name,
        type: session.type,
        toolCount: session.tools.length,
        connectedAtMs: session.connectedAtMs,
        lastUsedAtMs: session.lastUsedAtMs,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private requireSession(name: string): PooledSession {
    const session = this.sessions.get(name);
    if (!session) throw new Error(`MCP server is not connected: ${name}`);
    return session;
  }
}

function createClient(
  projectPath: string,
  server: McpServerConfig,
  options: { allowShell: boolean; timeoutMs?: number },
): PooledClient {
  if (server.type === "stdio") {
    if (!options.allowShell) throw new Error("MCP stdio connection requires shell permission. Run /shell on first.");
    return new McpStdioClient(serverCommand(server), projectPath, options.timeoutMs ?? 10_000);
  }
  if (server.type === "http") {
    if (!server.url) throw new Error(`MCP server has no url: ${server.name}`);
    return new McpHttpClient(server.url, options.timeoutMs ?? 10_000);
  }
  throw new Error(`MCP connection pool currently supports stdio and http servers only: ${server.name}`);
}

function serverCommand(server: McpServerConfig): string {
  return [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
}

function stderrOf(client: PooledClient): string {
  return client instanceof McpStdioClient ? client.stderr() : "";
}
