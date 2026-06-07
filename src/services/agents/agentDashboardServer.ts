import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { dashboardHtml as renderAgentPanelHtml } from "./agentDashboardPage.js";
import { buildAgentDashboardSnapshot, serializeAgentTraceJsonl } from "./agentDashboardModel.js";
import type { StateStore } from "../../state/sqlite.js";

export type AgentDashboardOpenResult = {
  runId: string;
  localUrl: string;
  shareUrl: string;
  tracePath: string;
  remoteAccess: "local-only" | "public-base-url";
};

export type AgentPanelOpenOptions = {
  share?: boolean;
  openBrowser?: boolean;
  writeTrace?: boolean;
};

type ServerOptions = {
  stateStore: StateStore;
  projectPath: string;
  dataDir: string;
};

let singleton: AgentPanelServer | undefined;

export function getAgentDashboardServer(options: ServerOptions): AgentPanelServer {
  if (!singleton) {
    singleton = new AgentPanelServer(options);
  } else {
    singleton.updateOptions(options);
  }
  return singleton;
}

export async function closeAgentDashboardServer(): Promise<void> {
  if (!singleton) return;
  await singleton.close();
  singleton = undefined;
}

export class AgentPanelServer {
  private stateStore: StateStore;
  private projectPath: string;
  private dataDir: string;
  private server?: http.Server;
  private host = process.env.DEEPSEEKCODE_AGENT_PANEL_HOST || "127.0.0.1";
  private port = Number(process.env.DEEPSEEKCODE_AGENT_PANEL_PORT || 0);
  private started = false;
  private tokens = new Map<string, string>();

  constructor(options: ServerOptions) {
    this.stateStore = options.stateStore;
    this.projectPath = options.projectPath;
    this.dataDir = options.dataDir;
  }

  updateOptions(options: ServerOptions): void {
    this.stateStore = options.stateStore;
    this.projectPath = options.projectPath;
    this.dataDir = options.dataDir;
  }

  async open(runId: string, options: AgentPanelOpenOptions = {}): Promise<AgentDashboardOpenResult> {
    await this.ensureStarted();
    const token = this.tokenFor(runId);
    const localHost = this.host === "0.0.0.0" ? "127.0.0.1" : this.host;
    const localUrl = `http://${localHost}:${this.port}/pixel/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
    const publicBaseUrl = (process.env.DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const shareUrl = publicBaseUrl
      ? `${publicBaseUrl}/pixel/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`
      : localUrl;
    const tracePath = options.writeTrace === false ? "" : this.writeTrace(runId);

    if (options.openBrowser) {
      openUrl(localUrl);
    }

    return {
      runId,
      localUrl,
      shareUrl,
      tracePath,
      remoteAccess: publicBaseUrl ? "public-base-url" : "local-only",
    };
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
    this.started = false;
  }

  private async ensureStarted(): Promise<void> {
    if (this.started && this.server) return;
    this.host = process.env.DEEPSEEKCODE_AGENT_PANEL_HOST || "127.0.0.1";
    this.port = Number(process.env.DEEPSEEKCODE_AGENT_PANEL_PORT || 0);
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, this.host, () => {
        const address = this.server?.address();
        if (address && typeof address === "object") {
          this.port = address.port;
        }
        this.started = true;
        resolve();
      });
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      setCors(res);
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const runId = routeRunId(url.pathname);
    if (!runId) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (!this.validToken(runId, url.searchParams.get("token") || "")) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Invalid or expired panel token");
      return;
    }

    if (url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/events")) {
      this.streamEvents(runId, res);
      return;
    }
    if (url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/snapshot")) {
      this.sendSnapshot(runId, res);
      return;
    }
    if (url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/trace.jsonl")) {
      this.sendTrace(runId, res);
      return;
    }
    if (url.pathname.startsWith("/pixel/") || url.pathname.startsWith("/panel/") || url.pathname.startsWith("/dashboard/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderAgentPanelHtml(runId, this.tokenFor(runId)));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }

  private sendSnapshot(runId: string, res: http.ServerResponse): void {
    const snapshot = buildAgentDashboardSnapshot({
      runId,
      state: this.stateStore,
      projectPath: this.projectPath,
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(snapshot));
  }

  private sendTrace(runId: string, res: http.ServerResponse): void {
    const tracePath = this.writeTrace(runId);
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
    res.end(fs.readFileSync(tracePath, "utf8"));
  }

  private streamEvents(runId: string, res: http.ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    const send = () => {
      const snapshot = buildAgentDashboardSnapshot({
        runId,
        state: this.stateStore,
        projectPath: this.projectPath,
      });
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    };
    send();
    const timer = setInterval(send, 1500);
    reqOnClose(res, () => clearInterval(timer));
  }

  private writeTrace(runId: string): string {
    const dir = path.join(this.dataDir, "agent-panel", runId);
    fs.mkdirSync(dir, { recursive: true });
    const tracePath = path.join(dir, "agent-trace.jsonl");
    const snapshot = buildAgentDashboardSnapshot({
      runId,
      state: this.stateStore,
      projectPath: this.projectPath,
    });
    fs.writeFileSync(tracePath, serializeAgentTraceJsonl(snapshot), "utf8");
    return tracePath;
  }

  private tokenFor(runId: string): string {
    const existing = this.tokens.get(runId);
    if (existing) return existing;
    const token = randomToken();
    this.tokens.set(runId, token);
    return token;
  }

  private validToken(runId: string, token: string): boolean {
    return Boolean(token) && this.tokenFor(runId) === token;
  }
}

function routeRunId(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "pixel" || parts[0] === "panel" || parts[0] === "dashboard") {
    return parts[1] ? decodeURIComponent(parts[1]) : undefined;
  }
  if (parts[0] === "api" && parts[1] === "runs" && parts[2]) {
    return decodeURIComponent(parts[2]);
  }
  return undefined;
}

function setCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function randomToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function reqOnClose(res: http.ServerResponse, callback: () => void): void {
  res.on("close", callback);
  res.on("finish", callback);
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], { windowsHide: true });
  } else if (platform === "darwin") {
    execFile("open", [url]);
  } else {
    execFile("xdg-open", [url]);
  }
}
