import fs from "node:fs";
import path from "node:path";
import {
  normalizeMcpName,
  parseMcpConfig,
  renderMcpConfig,
  validateMcpServer,
  type McpConfig,
  type McpServerConfig,
  type McpValidationResult,
} from "../../mcp/config.js";
import { callMcpHttpTool, probeMcpHttpServer } from "../../mcp/httpClient.js";
import { McpSessionPool, type McpSessionSnapshot } from "../../mcp/sessionPool.js";
import { callMcpStdioTool, probeMcpStdioServer, type McpProbeResult } from "../../mcp/stdioClient.js";

export interface McpHealthResult {
  name: string;
  type: McpServerConfig["type"];
  enabled: boolean;
  status: "ok" | "failed" | "disabled";
  attempts: number;
  latencyMs: number;
  toolCount: number;
  error?: string;
  stderr?: string;
}

export class McpService {
  private static readonly pools = new Map<string, McpSessionPool>();

  constructor(private readonly projectPath: string) {}

  get configPath(): string {
    return path.join(this.projectPath, ".deepseekcode", "mcp.json");
  }

  list(): McpServerConfig[] {
    return this.readConfig().servers;
  }

  addStdio(input: {
    name: string;
    command: string;
    args?: string[];
    description?: string;
    overwrite?: boolean;
  }): McpServerConfig {
    const name = normalizeMcpName(input.name);
    if (!name) throw new Error("MCP server name is empty");
    const command = input.command.trim();
    if (!command) throw new Error("MCP stdio command is empty");
    return this.upsert({
      name,
      type: "stdio",
      command,
      args: input.args ?? [],
      env: {},
      enabled: true,
      description: input.description ?? "",
    }, Boolean(input.overwrite));
  }

  addHttp(input: {
    name: string;
    url: string;
    type?: "http" | "websocket";
    description?: string;
    overwrite?: boolean;
  }): McpServerConfig {
    const name = normalizeMcpName(input.name);
    if (!name) throw new Error("MCP server name is empty");
    const url = input.url.trim();
    if (!url) throw new Error("MCP server url is empty");
    return this.upsert({
      name,
      type: input.type ?? "http",
      url,
      args: [],
      env: {},
      enabled: true,
      description: input.description ?? "",
    }, Boolean(input.overwrite));
  }

  remove(name: string): boolean {
    const config = this.readConfig();
    const normalized = normalizeMcpName(name);
    const before = config.servers.length;
    config.servers = config.servers.filter((server) => server.name !== normalized);
    if (config.servers.length === before) return false;
    this.writeConfig(config);
    return true;
  }

  setEnabled(name: string, enabled: boolean): McpServerConfig | null {
    const config = this.readConfig();
    const normalized = normalizeMcpName(name);
    const server = config.servers.find((candidate) => candidate.name === normalized);
    if (!server) return null;
    server.enabled = enabled;
    this.writeConfig(config);
    return server;
  }

  validate(name?: string): McpValidationResult[] {
    const normalized = name ? normalizeMcpName(name) : "";
    const servers = normalized
      ? this.list().filter((server) => server.name === normalized)
      : this.list();
    if (normalized && servers.length === 0) {
      return [{ name: normalized, ok: false, errors: [`MCP server not found: ${normalized}`], warnings: [] }];
    }
    return servers.map(validateMcpServer);
  }

  async probe(name: string, options: { allowShell: boolean; timeoutMs?: number }): Promise<McpProbeResult> {
    const server = this.requireServer(name);
    if (!server.enabled) throw new Error(`MCP server is disabled: ${server.name}`);
    if (this.pool().has(server.name)) return this.pool().probe(server.name);
    if (server.type === "http") {
      return probeMcpHttpServer(this.serverUrl(server), options.timeoutMs ?? 10_000);
    }
    if (server.type !== "stdio") throw new Error(`MCP probe currently supports stdio and http servers only: ${server.name}`);
    if (!options.allowShell) throw new Error("MCP stdio probing requires shell permission. Run /shell on first.");
    return probeMcpStdioServer(this.serverCommand(server), this.projectPath, options.timeoutMs ?? 10_000);
  }

  async probeWithRetry(
    name: string,
    options: { allowShell: boolean; timeoutMs?: number; attempts?: number; backoffMs?: number },
  ): Promise<{ probe: McpProbeResult; attempts: number; latencyMs: number }> {
    const maxAttempts = Math.max(1, Math.min(5, Math.trunc(options.attempts ?? 2)));
    const backoffMs = Math.max(0, Math.trunc(options.backoffMs ?? 250));
    const started = Date.now();
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const probe = await this.probe(name, options);
        return { probe, attempts: attempt, latencyMs: Date.now() - started };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && backoffMs > 0) await sleep(backoffMs * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async health(
    name: string | undefined,
    options: { allowShell: boolean; timeoutMs?: number; attempts?: number; backoffMs?: number },
  ): Promise<McpHealthResult[]> {
    const normalized = name ? normalizeMcpName(name) : "";
    const servers = normalized
      ? this.list().filter((server) => server.name === normalized)
      : this.list();
    if (normalized && servers.length === 0) {
      throw new Error(`MCP server not found: ${normalized}`);
    }
    const results: McpHealthResult[] = [];
    for (const server of servers) {
      if (!server.enabled) {
        results.push({
          name: server.name,
          type: server.type,
          enabled: false,
          status: "disabled",
          attempts: 0,
          latencyMs: 0,
          toolCount: 0,
        });
        continue;
      }
      const started = Date.now();
      try {
        const result = await this.probeWithRetry(server.name, options);
        results.push({
          name: server.name,
          type: server.type,
          enabled: true,
          status: "ok",
          attempts: result.attempts,
          latencyMs: result.latencyMs,
          toolCount: result.probe.tools.length,
          stderr: result.probe.stderr,
        });
      } catch (error) {
        results.push({
          name: server.name,
          type: server.type,
          enabled: true,
          status: "failed",
          attempts: Math.max(1, Math.min(5, Math.trunc(options.attempts ?? 2))),
          latencyMs: Date.now() - started,
          toolCount: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  async callTool(
    name: string,
    toolName: string,
    args: Record<string, unknown>,
    options: { allowShell: boolean; timeoutMs?: number },
  ): Promise<{ result: unknown; stderr: string }> {
    const server = this.requireServer(name);
    if (!server.enabled) throw new Error(`MCP server is disabled: ${server.name}`);
    if (this.pool().has(server.name)) return this.pool().callTool(server.name, toolName, args);
    if (server.type === "http") {
      return callMcpHttpTool(this.serverUrl(server), toolName, args, options.timeoutMs ?? 10_000);
    }
    if (server.type !== "stdio") throw new Error(`MCP call currently supports stdio and http servers only: ${server.name}`);
    if (!options.allowShell) throw new Error("MCP stdio tool calls require shell permission. Run /shell on first.");
    return callMcpStdioTool(this.serverCommand(server), this.projectPath, toolName, args, options.timeoutMs ?? 10_000);
  }

  requiresShell(name: string): boolean {
    return this.requireServer(name).type === "stdio";
  }

  async connect(name: string, options: { allowShell: boolean; timeoutMs?: number }): Promise<McpProbeResult> {
    const server = this.requireServer(name);
    if (!server.enabled) throw new Error(`MCP server is disabled: ${server.name}`);
    return this.pool().connect(server, options);
  }

  sessions(): McpSessionSnapshot[] {
    return this.pool().list();
  }

  closeSession(name?: string): number {
    return this.pool().close(name);
  }

  private upsert(server: McpServerConfig, overwrite: boolean): McpServerConfig {
    const config = this.readConfig();
    const index = config.servers.findIndex((candidate) => candidate.name === server.name);
    if (index >= 0 && !overwrite) throw new Error(`MCP server already exists: ${server.name}`);
    if (index >= 0) config.servers[index] = server;
    else config.servers.push(server);
    this.writeConfig(config);
    return server;
  }

  private requireServer(name: string): McpServerConfig {
    const normalized = normalizeMcpName(name);
    const server = this.list().find((candidate) => candidate.name === normalized);
    if (!server) throw new Error(`MCP server not found: ${normalized}`);
    return server;
  }

  private serverCommand(server: McpServerConfig): string {
    return [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
  }

  private serverUrl(server: McpServerConfig): string {
    if (!server.url) throw new Error(`MCP server has no url: ${server.name}`);
    return server.url;
  }

  private readConfig(): McpConfig {
    if (!fs.existsSync(this.configPath)) return { servers: [] };
    return parseMcpConfig(JSON.parse(fs.readFileSync(this.configPath, "utf8")));
  }

  private writeConfig(config: McpConfig): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, renderMcpConfig(config), "utf8");
  }

  private pool(): McpSessionPool {
    const key = path.resolve(this.projectPath);
    let pool = McpService.pools.get(key);
    if (!pool) {
      pool = new McpSessionPool(key);
      McpService.pools.set(key, pool);
    }
    return pool;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
