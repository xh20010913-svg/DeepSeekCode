import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpProbeResult {
  server: unknown;
  tools: unknown[];
  stderr: string;
}

export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(
    private readonly command: string,
    private readonly cwd: string,
    private readonly timeoutMs = 10_000,
    private readonly maxStderrChars = 8_000,
  ) {}

  async connect(): Promise<unknown> {
    this.child = spawn(this.command, {
      cwd: this.cwd,
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrBuffer = (this.stderrBuffer + chunk.toString()).slice(-this.maxStderrChars);
    });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("close", (code) => {
      if (this.pending.size > 0) this.rejectAll(new Error(`MCP server exited with code ${code ?? "unknown"}`));
    });

    const result = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "deepseekcode",
        version: "0.1.0",
      },
    });
    this.notify("notifications/initialized", {});
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

  stderr(): string {
    return this.stderrBuffer;
  }

  close(): void {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.write({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (response) => {
          clearTimeout(timer);
          if (response.error) {
            reject(new Error(response.error.message));
            return;
          }
          resolve(response.result);
        },
        reject,
        timer,
      });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.child) throw new Error("MCP server is not connected");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString();
    const parts = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim()) continue;
      let message: unknown;
      try {
        message = JSON.parse(part);
      } catch {
        continue;
      }
      if (!isRecord(message)) continue;
      if (typeof message.id === "number" && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        pending.resolve(message as unknown as JsonRpcResponse);
      } else if (typeof message.id === "number" && typeof message.method === "string") {
        this.writeRaw({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unsupported server request: ${message.method}`,
          },
        });
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private writeRaw(message: JsonRpcResponse): void {
    if (!this.child) throw new Error("MCP server is not connected");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

export async function probeMcpStdioServer(
  command: string,
  cwd: string,
  timeoutMs = 10_000,
): Promise<McpProbeResult> {
  const client = new McpStdioClient(command, cwd, timeoutMs);
  try {
    const server = await client.connect();
    const tools = await client.listTools();
    return {
      server,
      tools,
      stderr: client.stderr(),
    };
  } finally {
    client.close();
  }
}

export async function callMcpStdioTool(
  command: string,
  cwd: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ result: unknown; stderr: string }> {
  const client = new McpStdioClient(command, cwd, timeoutMs);
  try {
    await client.connect();
    const result = await client.callTool(toolName, args);
    return { result, stderr: client.stderr() };
  } finally {
    client.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
