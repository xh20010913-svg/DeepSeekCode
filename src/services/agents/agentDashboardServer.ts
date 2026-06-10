import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildAgentDashboardSnapshot,
  serializeAgentTraceJsonl,
  type AgentDashboardRole,
  type AgentDashboardSnapshot,
  type AgentDashboardTimelineEvent,
} from "./agentDashboardModel.js";
import { buildAgentDashboardOverlay } from "./agentDashboardOverlay.js";
import type { StateStore } from "../../state/sqlite.js";

export type AgentDashboardOpenResult = {
  runId: string;
  localUrl: string;
  shareUrl: string;
  tracePath: string;
  remoteAccess: "local-only" | "public-base-url" | "cloudflare-quick-tunnel";
  tokenExpiresAtMs: number;
  tunnelOutput?: string[];
};

export type AgentPanelOpenOptions = {
  share?: boolean;
  openBrowser?: boolean;
  writeTrace?: boolean;
  tunnel?: "cloudflare";
};

type ServerOptions = {
  stateStore: StateStore;
  projectPath: string;
  dataDir: string;
};

type PixelMessage = Record<string, unknown>;

type PixelAssets = {
  layout: Record<string, unknown> | null;
  furnitureCatalog: unknown[];
  furnitureSprites: Record<string, unknown>;
  characterSprites: unknown[];
  floorSprites: unknown[];
  wallSprites: unknown[];
};

type PixelSocketRoute = {
  runId: string;
  token: string;
};

type PanelToken = {
  token: string;
  expiresAtMs: number;
};

type CloudflareTunnelState = {
  process: ChildProcess;
  publicBaseUrl?: string;
  startedAtMs: number;
  output: string[];
};

let singleton: AgentPanelServer | undefined;
const require = createRequire(import.meta.url);

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
  private wss?: WebSocketServer;
  private host = process.env.DEEPSEEKCODE_AGENT_PANEL_HOST || "127.0.0.1";
  private port = Number(process.env.DEEPSEEKCODE_AGENT_PANEL_PORT || 0);
  private started = false;
  private tokens = new Map<string, PanelToken>();
  private socketTimers = new Set<NodeJS.Timeout>();
  private pixelAssets?: PixelAssets;
  private cloudflareTunnel?: CloudflareTunnelState;

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
    if (options.tunnel === "cloudflare") {
      await this.ensureCloudflareQuickTunnel();
    }
    const localHost = this.host === "0.0.0.0" ? "127.0.0.1" : this.host;
    const localUrl = `http://${localHost}:${this.port}/pixel/${encodeURIComponent(runId)}?token=${encodeURIComponent(token.token)}`;
    const configuredPublicBaseUrl = (process.env.DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const publicBaseUrl = configuredPublicBaseUrl || this.cloudflareTunnel?.publicBaseUrl || "";
    const shareUrl = publicBaseUrl
      ? `${publicBaseUrl}/pixel/${encodeURIComponent(runId)}?token=${encodeURIComponent(token.token)}`
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
      remoteAccess: configuredPublicBaseUrl ? "public-base-url" : this.cloudflareTunnel?.publicBaseUrl ? "cloudflare-quick-tunnel" : "local-only",
      tokenExpiresAtMs: token.expiresAtMs,
      tunnelOutput: this.cloudflareTunnel?.output.slice(-20),
    };
  }

  async close(): Promise<void> {
    this.broadcastPanelShutdown("DeepSeekCode TUI 已关闭，本地 Pixel 面板连接断开。");
    await delay(80);
    for (const timer of this.socketTimers) {
      clearInterval(timer);
    }
    this.socketTimers.clear();
    await new Promise<void>((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
          client.close(1001, "DeepSeekCode TUI closed");
        }
      }
      this.wss.close(() => resolve());
    });
    this.wss = undefined;
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
    this.started = false;
    this.cloudflareTunnel?.process.kill();
    this.cloudflareTunnel = undefined;
  }

  private async ensureStarted(): Promise<void> {
    if (this.started && this.server) return;
    this.host = process.env.DEEPSEEKCODE_AGENT_PANEL_HOST || "127.0.0.1";
    this.port = Number(process.env.DEEPSEEKCODE_AGENT_PANEL_PORT || 0);
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (req, socket, head) => {
      const route = this.websocketRoute(req);
      if (!route || !this.validToken(route.runId, route.token)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.attachPixelSocket(ws, route.runId);
      });
    });
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

    if (url.pathname === "/" || url.pathname === "/pixel") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("DeepSeekCode Pixel Agents panel server. Open it from /agents dashboard or an active multi-agent workflow link.");
      return;
    }

    if (url.pathname.startsWith("/pixel-assets/")) {
      this.servePixelAsset(url.pathname, res);
      return;
    }

    if (url.pathname === "/agent-assets/gsap.min.js") {
      this.serveGsap(res);
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
    if (url.pathname.startsWith("/panel/") || url.pathname.startsWith("/dashboard/")) {
      res.writeHead(302, {
        Location: `/pixel/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.tokenFor(runId).token)}`,
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith("/pixel/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(this.renderPixelIndex(runId));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }

  private sendSnapshot(runId: string, res: http.ServerResponse): void {
    const snapshot = this.snapshot(runId);
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
      res.write("event: snapshot\n");
      res.write(`data: ${JSON.stringify(this.snapshot(runId))}\n\n`);
    };
    send();
    const timer = setInterval(send, 1500);
    reqOnClose(res, () => clearInterval(timer));
  }

  private attachPixelSocket(socket: WebSocket, runId: string): void {
    const sendBootstrap = () => {
      for (const message of this.pixelBootstrapMessages(runId)) {
        sendSocket(socket, message);
      }
      this.sendPixelSnapshot(socket, runId);
    };
    sendBootstrap();

    socket.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (message?.type === "webviewReady" || message?.type === "requestDiagnostics") {
        sendBootstrap();
      }
    });

    const timer = setInterval(() => this.sendPixelSnapshot(socket, runId), 1500);
    this.socketTimers.add(timer);
    socket.on("close", () => {
      clearInterval(timer);
      this.socketTimers.delete(timer);
    });
  }

  private sendPixelSnapshot(socket: WebSocket, runId: string): void {
    const snapshot = this.snapshot(runId);
    for (const message of pixelMessagesFromSnapshot(snapshot)) {
      sendSocket(socket, message);
    }
  }

  private broadcastPanelShutdown(message: string): void {
    if (!this.wss) return;
    const payload = {
      type: "serverShutdown",
      status: "closed",
      message,
      createdAtMs: Date.now(),
    };
    for (const client of this.wss.clients) {
      sendSocket(client, payload);
    }
  }

  private pixelBootstrapMessages(runId: string): PixelMessage[] {
    const snapshot = this.snapshot(runId);
    const assets = this.loadPixelAssets();
    const bootstrapRoles = rolesForSnapshot(snapshot);
    const ids = roleIds(bootstrapRoles);
    const folderName = path.basename(this.projectPath) || "project";
    const agentMeta: Record<string, { palette: number; hueShift: number; seatId: string | null }> = {};
    const folderNames: Record<string, string> = {};
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index] ?? index + 1;
      agentMeta[String(id)] = { palette: id % 8, hueShift: 0, seatId: seatIdForRole(bootstrapRoles[index], id, snapshot.layoutModel?.roleLocations) };
      folderNames[String(id)] = folderName;
    }
    const layout = buildDeepSeekPixelLayout(assets.layout);

    return [
      {
        type: "providerCapabilities",
        readingTools: ["read_file", "grep_files", "glob_files", "list_files"],
        subagentToolNames: ["Task", "Agent", "start_agent_workflow", "send_agent_message"],
      },
      {
        type: "settingsLoaded",
        soundEnabled: false,
        lastSeenVersion: "deepseekcode-0.3",
        extensionVersion: "deepseekcode-0.3.3",
        watchAllSessions: false,
        alwaysShowLabels: false,
        hooksEnabled: false,
        hooksInfoShown: true,
        externalAssetDirectories: [],
      },
      {
        type: "workspaceFolders",
        folders: [{ name: folderName, path: this.projectPath }],
      },
      {
        type: "characterSpritesLoaded",
        characters: assets.characterSprites,
      },
      {
        type: "floorTilesLoaded",
        sprites: assets.floorSprites,
      },
      {
        type: "wallTilesLoaded",
        sets: assets.wallSprites,
      },
      {
        type: "furnitureAssetsLoaded",
        catalog: assets.furnitureCatalog,
        sprites: assets.furnitureSprites,
      },
      {
        type: "existingAgents",
        agents: ids,
        agentMeta,
        folderNames,
        externalAgents: {},
      },
      {
        type: "layoutLoaded",
        layout,
      },
    ];
  }

  private snapshot(runId: string): AgentDashboardSnapshot {
    return buildAgentDashboardSnapshot({
      runId,
      state: this.stateStore,
      projectPath: this.projectPath,
    });
  }

  private writeTrace(runId: string): string {
    const dir = path.join(this.dataDir, "agent-panel", runId);
    fs.mkdirSync(dir, { recursive: true });
    const tracePath = path.join(dir, "agent-trace.jsonl");
    fs.writeFileSync(tracePath, serializeAgentTraceJsonl(this.snapshot(runId)), "utf8");
    return tracePath;
  }

  private tokenFor(runId: string): PanelToken {
    const existing = this.tokens.get(runId);
    const now = Date.now();
    if (existing && existing.expiresAtMs > now) return existing;
    const token = {
      token: randomToken(),
      expiresAtMs: now + panelTokenTtlMs(),
    };
    this.tokens.set(runId, token);
    return token;
  }

  private validToken(runId: string, token: string): boolean {
    const existing = this.tokens.get(runId);
    if (!existing || existing.expiresAtMs <= Date.now()) {
      this.tokens.delete(runId);
      return false;
    }
    return Boolean(token) && existing.token === token;
  }

  private async ensureCloudflareQuickTunnel(): Promise<void> {
    if (this.cloudflareTunnel?.process && !this.cloudflareTunnel.process.killed && this.cloudflareTunnel.publicBaseUrl) {
      return;
    }
    const executable = await resolveCommand("cloudflared");
    if (!executable) {
      throw new Error([
        "cloudflared is not installed or not on PATH.",
        "Install it with: winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements",
        "Then run /agents dashboard tunnel again.",
      ].join("\n"));
    }
    const targetUrl = `http://127.0.0.1:${this.port}`;
    const child = spawn(executable, ["tunnel", "--url", targetUrl, "--no-autoupdate"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tunnel: CloudflareTunnelState = {
      process: child,
      publicBaseUrl: undefined,
      startedAtMs: Date.now(),
      output: [],
    };
    this.cloudflareTunnel = tunnel;
    const collect = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      tunnel.output.push(...text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      tunnel.output = tunnel.output.slice(-80);
      const found = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
      if (found) tunnel.publicBaseUrl = found.replace(/\/+$/, "");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("exit", (code, signal) => {
      tunnel.output.push(`cloudflared exited code=${code ?? "null"} signal=${signal ?? "null"}`);
      if (this.cloudflareTunnel === tunnel) this.cloudflareTunnel = undefined;
    });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (tunnel.publicBaseUrl) return;
      if (child.killed || child.exitCode !== null) break;
      await delay(250);
    }
    child.kill();
    const detail = tunnel.output.slice(-8).join("\n");
    this.cloudflareTunnel = undefined;
    throw new Error(`cloudflared did not produce a trycloudflare URL within 20s.${detail ? `\n${detail}` : ""}`);
  }

  private websocketRoute(req: http.IncomingMessage): PixelSocketRoute | undefined {
    const host = req.headers.host || "127.0.0.1";
    const url = new URL(req.url || "/", `http://${host}`);
    if (url.pathname !== "/ws") return undefined;
    const directRunId = url.searchParams.get("runId");
    const directToken = url.searchParams.get("token");
    if (directRunId && directToken) {
      return { runId: directRunId, token: directToken };
    }
    const referer = req.headers.referer;
    if (!referer) return undefined;
    try {
      const refererUrl = new URL(referer, `http://${host}`);
      const runId = routeRunId(refererUrl.pathname);
      const token = refererUrl.searchParams.get("token") || "";
      return runId ? { runId, token } : undefined;
    } catch {
      return undefined;
    }
  }

  private renderPixelIndex(runId: string): string {
    const indexPath = path.join(pixelRoot(), "index.html");
    if (!fs.existsSync(indexPath)) {
      return `<!doctype html><meta charset="utf-8"><title>DeepSeekCode Pixel Agents</title><body><h1>Pixel Agents assets missing</h1><p>Run build or reinstall the package.</p></body>`;
    }
    const panelConfig = JSON.stringify({
      runId,
      projectPath: this.projectPath,
      api: `/api/runs/${encodeURIComponent(runId)}`,
      trace: `/api/runs/${encodeURIComponent(runId)}/trace.jsonl`,
      language: "zh-CN",
    }).replace(/</g, "\\u003c");
    const bootstrapScript = `<script>
(() => {
  const panel = ${panelConfig};
  panel.token = new URLSearchParams(window.location.search).get("token") || "";
  window.DEEPSEEKCODE_PIXEL_PANEL = panel;
  const NativeWebSocket = window.WebSocket;
  function PatchedWebSocket(url, protocols) {
    let nextUrl = url;
    try {
      const target = new URL(String(url), window.location.href);
      if (target.pathname === "/ws" && !target.searchParams.has("runId")) {
        target.searchParams.set("runId", panel.runId);
        target.searchParams.set("token", new URLSearchParams(window.location.search).get("token") || "");
        nextUrl = target.toString();
      }
    } catch {}
    return protocols === undefined ? new NativeWebSocket(nextUrl) : new NativeWebSocket(nextUrl, protocols);
  }
  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    Object.defineProperty(PatchedWebSocket, key, { value: NativeWebSocket[key] });
  }
  window.WebSocket = PatchedWebSocket;
})();
</script>`;
    const overlay = buildAgentDashboardOverlay();
    const html = fs.readFileSync(indexPath, "utf8")
      .replace("<title>webview-ui</title>", "<title>DeepSeekCode Pixel Agents</title>")
      .replace('href="/vite.svg"', 'href="/pixel-assets/banner.png"')
      .split("./assets/")
      .join("/pixel-assets/assets/")
      .replace("</head>", `${bootstrapScript}${overlay.style}</head>`);
    return html.includes("</body>")
      ? html.replace("</body>", `${overlay.markup}${overlay.script}</body>`)
      : `${html}${overlay.markup}${overlay.script}`;
  }

  private servePixelAsset(requestPath: string, res: http.ServerResponse): void {
    const root = pixelRoot();
    const relative = decodeURIComponent(requestPath.replace(/^\/pixel-assets\/?/, ""));
    const target = path.resolve(root, relative);
    const relativeTarget = path.relative(root, target);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Asset not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeType(target), "Cache-Control": "public, max-age=3600" });
    fs.createReadStream(target).pipe(res);
  }

  private serveGsap(res: http.ServerResponse): void {
    try {
      const target = require.resolve("gsap/dist/gsap.min.js");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      fs.createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("GSAP asset not found. Run npm install.");
    }
  }

  private loadPixelAssets(): PixelAssets {
    if (this.pixelAssets) return this.pixelAssets;
    const root = pixelRoot();
    this.pixelAssets = {
      layout: readJson(path.join(root, "assets", "default-layout-1.json"), null),
      furnitureCatalog: readJson(path.join(root, "assets", "furniture-catalog.json"), []),
      furnitureSprites: readJson(path.join(root, "assets", "decoded", "furniture.json"), {}),
      characterSprites: readJson(path.join(root, "assets", "decoded", "characters.json"), []),
      floorSprites: readJson(path.join(root, "assets", "decoded", "floors.json"), []),
      wallSprites: readJson(path.join(root, "assets", "decoded", "walls.json"), []),
    };
    return this.pixelAssets;
  }
}

function seatIdForRole(
  role: AgentDashboardRole | undefined,
  id: number,
  roleLocations?: Record<string, "workbench" | "dispatch" | "lounge" | "review" | "blocked">,
): string | null {
  const workSeats = [
    "f-1773356768339-eo6u",
    "f-1773356769007-a8jm",
    "f-1773354877474-kt9s",
    "f-1773354880309-yphd",
    "f-1773354879805-px9b",
    "f-1773354881902-9m50",
  ];
  const restSeats = [
    "f-1773354668333-lo7w",
    "f-1773354665989-zgrw",
    "f-1773354664329-hxsh",
    "f-1773354670818-r1q2",
  ];
  const dispatchSeats = [
    "f-1773354880309-yphd",
    "f-1773354879805-px9b",
  ];
  const blockedSeats = [
    "f-1773354877474-kt9s",
  ];
  if (!role) return restSeats[(id - 1) % restSeats.length] ?? null;
  const location = roleLocations?.[role.role];
  if (location === "workbench") return workSeats[(id - 1) % workSeats.length] ?? null;
  if (location === "dispatch" || location === "review") return dispatchSeats[(id - 1) % dispatchSeats.length] ?? workSeats[(id - 1) % workSeats.length] ?? null;
  if (location === "blocked") return blockedSeats[(id - 1) % blockedSeats.length] ?? workSeats[(id - 1) % workSeats.length] ?? null;
  if (location === "lounge") return restSeats[(id - 1) % restSeats.length] ?? null;
  if (role.status === "running" || role.status === "paused") {
    return workSeats[(id - 1) % workSeats.length] ?? null;
  }
  return restSeats[(id - 1) % restSeats.length] ?? workSeats[(id - 1) % workSeats.length] ?? null;
}

function buildDeepSeekPixelLayout(base: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!base) return base;
  const layout = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  const furniture = Array.isArray(layout.furniture) ? [...layout.furniture] as Array<Record<string, unknown>> : [];
  const addFurniture = (item: Record<string, unknown>) => {
    if (!furniture.some((existing) => existing.uid === item.uid)) furniture.push(item);
  };
  addFurniture({ uid: "dsc-whiteboard-main", type: "WHITEBOARD", col: 11, row: 9 });
  addFurniture({ uid: "dsc-review-bench", type: "WOODEN_BENCH", col: 17, row: 19 });
  addFurniture({ uid: "dsc-plan-table", type: "SMALL_TABLE", col: 18, row: 18 });
  addFurniture({ uid: "dsc-standup-board", type: "WHITEBOARD", col: 13, row: 11 });
  addFurniture({ uid: "dsc-work-desk-a", type: "DESK_SIDE", col: 9, row: 12 });
  addFurniture({ uid: "dsc-work-pc-a", type: "PC_SIDE:left", col: 10, row: 12 });
  addFurniture({ uid: "dsc-work-desk-b", type: "DESK_SIDE", col: 1, row: 14 });
  addFurniture({ uid: "dsc-work-pc-b", type: "PC_SIDE", col: 2, row: 14 });
  addFurniture({ uid: "dsc-rest-coffee", type: "COFFEE", col: 15, row: 14 });
  layout.furniture = furniture;
  return cropPixelLayoutTop(layout, 8);
}

function cropPixelLayoutTop(layout: Record<string, unknown>, rowsToDrop: number): Record<string, unknown> {
  const cols = Number(layout.cols);
  const rows = Number(layout.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= rowsToDrop) return layout;
  const cropArray = (value: unknown) => Array.isArray(value) ? value.slice(cols * rowsToDrop) : value;
  const nextRows = rows - rowsToDrop;
  const furniture = Array.isArray(layout.furniture)
    ? (layout.furniture as Array<Record<string, unknown>>)
      .map((item) => ({ ...item, row: Math.max(0, Number(item.row ?? 0) - rowsToDrop) }))
      .filter((item) => Number(item.row) < nextRows)
    : layout.furniture;
  return {
    ...layout,
    rows: nextRows,
    tiles: cropArray(layout.tiles),
    tileColors: cropArray(layout.tileColors),
    furniture,
  };
}

function pixelDashboardOverlay(): { style: string; markup: string; script: string } {
  const style = `<style>
:root{--dsc-ink:#17202a;--dsc-muted:#657083;--dsc-panel:#fbfcfe;--dsc-line:#d7dde8;--dsc-good:#17805c;--dsc-run:#2563eb;--dsc-warn:#b7791f;--dsc-bad:#c43b3b;--dsc-idle:#7b8494}
#dsc-panel{position:fixed;right:14px;top:14px;bottom:14px;width:min(420px,calc(100vw - 28px));z-index:2147483000;background:rgba(251,252,254,.96);border:1px solid var(--dsc-line);box-shadow:0 16px 46px rgba(12,20,33,.18);border-radius:8px;color:var(--dsc-ink);font:13px/1.42 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(10px)}
#dsc-panel *{box-sizing:border-box;letter-spacing:0}
#dsc-head{padding:12px 14px;border-bottom:1px solid var(--dsc-line);display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start;background:linear-gradient(180deg,#fff,#f4f7fb)}
#dsc-title{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#dsc-sub{color:var(--dsc-muted);font-size:12px;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap}
#dsc-progress{height:7px;background:#e7ebf2;border-radius:999px;overflow:hidden;margin:10px 14px 8px}
#dsc-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#2563eb,#17805c);transition:width .45s ease}
#dsc-tabs{display:flex;gap:6px;padding:0 14px 10px;border-bottom:1px solid var(--dsc-line);overflow-x:auto}
.dsc-tab{border:1px solid var(--dsc-line);background:#fff;border-radius:6px;padding:5px 8px;font-size:12px;color:var(--dsc-muted);cursor:pointer;white-space:nowrap}
.dsc-tab[aria-selected=true]{background:#17202a;color:#fff;border-color:#17202a}
#dsc-body{overflow:auto;padding:10px 14px 14px;display:flex;flex-direction:column;gap:8px}
.dsc-card{border:1px solid var(--dsc-line);border-radius:8px;background:#fff;padding:9px 10px;animation:dsc-in .28s ease both}
.dsc-task{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:start;cursor:pointer}
.dsc-dot{width:9px;height:9px;border-radius:99px;margin-top:5px;background:var(--dsc-idle)}
.dsc-dot.running{background:var(--dsc-run);box-shadow:0 0 0 4px rgba(37,99,235,.12)}
.dsc-dot.succeeded{background:var(--dsc-good)}
.dsc-dot.needs_review{background:var(--dsc-warn)}
.dsc-dot.blocked,.dsc-dot.failed{background:var(--dsc-bad)}
.dsc-name{font-weight:650;min-width:0;overflow-wrap:anywhere}
.dsc-meta{font-size:12px;color:var(--dsc-muted);margin-top:2px;overflow-wrap:anywhere}
.dsc-pill{font-size:11px;border:1px solid var(--dsc-line);border-radius:999px;padding:2px 7px;color:var(--dsc-muted);white-space:nowrap}
#dsc-detail{border-top:1px solid var(--dsc-line);padding:10px 14px;background:#f7f9fc;max-height:36%;overflow:auto}
#dsc-detail h3{font-size:13px;margin:0 0 6px}
#dsc-detail p{margin:4px 0;color:var(--dsc-muted);overflow-wrap:anywhere}
#dsc-toggle{display:none;border:1px solid var(--dsc-line);background:#fff;border-radius:6px;padding:5px 8px;font-size:12px;color:var(--dsc-ink)}
@keyframes dsc-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:700px){#dsc-panel{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:58vh;border-radius:8px}#dsc-panel.dsc-collapsed{max-height:52px}#dsc-panel.dsc-collapsed #dsc-progress,#dsc-panel.dsc-collapsed #dsc-tabs,#dsc-panel.dsc-collapsed #dsc-body,#dsc-panel.dsc-collapsed #dsc-detail{display:none}#dsc-toggle{display:inline-block}#dsc-head{padding:9px 10px}#dsc-title{font-size:13px}}
</style>`;
  const markup = `<section id="dsc-panel" aria-label="DeepSeekCode multi-agent task dashboard">
  <header id="dsc-head"><div><div id="dsc-title">DeepSeekCode Agents</div><div id="dsc-sub"></div></div><button id="dsc-toggle" type="button">展开</button></header>
  <div id="dsc-progress"><span></span></div>
  <nav id="dsc-tabs" aria-label="task filters"></nav>
  <main id="dsc-body"></main>
  <aside id="dsc-detail"></aside>
</section>`;
  const script = `<script>
(() => {
  const panel = window.DEEPSEEKCODE_PIXEL_PANEL;
  if (!panel) return;
  const root = document.getElementById("dsc-panel");
  const title = document.getElementById("dsc-title");
  const sub = document.getElementById("dsc-sub");
  const progress = document.querySelector("#dsc-progress span");
  const tabs = document.getElementById("dsc-tabs");
  const body = document.getElementById("dsc-body");
  const detail = document.getElementById("dsc-detail");
  const toggle = document.getElementById("dsc-toggle");
  let filter = "all";
  let selected = "";
  const filters = [["all","全部"],["unfinished","未完成"],["running","进行中"],["needs_review","待验收"],["succeeded","已完成"],["blocked","阻塞"]];
  toggle?.addEventListener("click", () => {
    root.classList.toggle("dsc-collapsed");
    toggle.textContent = root.classList.contains("dsc-collapsed") ? "展开" : "收起";
  });
  function esc(v){return String(v ?? "").replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));}
  function statusText(v){return ({queued:"未开始",running:"进行中",needs_review:"待验收",succeeded:"已完成",failed:"失败",blocked:"阻塞",skipped:"已跳过"}[v] || v || "未知");}
  function visible(task){
    if (filter === "all") return true;
    if (filter === "unfinished") return !["succeeded","skipped"].includes(task.status);
    if (filter === "blocked") return ["blocked","failed"].includes(task.status);
    return task.status === filter;
  }
  function renderTabs(snapshot){
    const counts = snapshot.completionSummary || {};
    tabs.innerHTML = filters.map(([id,label]) => {
      const count = id === "all" ? counts.total : id === "unfinished" ? (counts.total || 0) - (counts.succeeded || 0) - (counts.skipped || 0) : id === "needs_review" ? counts.needsReview : id === "blocked" ? (counts.blocked || 0) + (counts.failed || 0) : counts[id] || 0;
      return '<button class="dsc-tab" aria-selected="'+(filter===id)+'" data-filter="'+id+'">'+label+' '+count+'</button>';
    }).join("");
    tabs.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { filter = btn.dataset.filter || "all"; render(snapshot); }));
  }
  function renderDetail(snapshot, task){
    if (!task) {
      detail.innerHTML = '<h3>移动摘要</h3><p>'+esc(snapshot.mobileSummary?.nextStep || "等待进展")+'</p>';
      return;
    }
    const role = (snapshot.roles || []).find(r => r.role === task.assigneeRole) || {};
    const skill = (snapshot.generatedSkills || []).find(s => s.id === role.generatedSkillId || s.role === role.role) || {};
    detail.innerHTML = '<h3>'+esc(task.title)+'</h3>'
      + '<p><b>负责人</b> '+esc(task.assigneeRole)+' · '+esc(statusText(task.status))+'</p>'
      + '<p><b>验收</b> '+esc((task.acceptanceCriteria || []).join(" | ") || "暂无")+'</p>'
      + '<p><b>证据</b> '+esc((task.evidence || []).join(" | ") || "暂无")+'</p>'
      + '<p><b>Skill</b> '+esc(skill.summary || role.generatedSkillSummary || "暂无")+'</p>'
      + '<p><b>Checkpoint</b> '+esc(role.checkpoint || "暂无")+'</p>'
      + (task.blockedBy ? '<p><b>阻塞</b> '+esc(task.blockedBy)+'</p>' : '');
  }
  function render(snapshot){
    const tasks = snapshot.subtaskGraph || [];
    const completion = snapshot.completionSummary || { total: tasks.length, percent: 0 };
    title.textContent = snapshot.overview?.objective || "DeepSeekCode Agents";
    sub.innerHTML = '<span>'+esc(snapshot.phase || snapshot.overview?.phase || "unknown")+'</span><span>'+esc(snapshot.approvalState?.status || "")+'</span><span>'+esc((snapshot.mobileSummary && snapshot.mobileSummary.overallProgress) || "")+'</span>';
    progress.style.width = (completion.percent || 0) + "%";
    renderTabs(snapshot);
    const shown = tasks.filter(visible);
    body.innerHTML = shown.length ? shown.map(task => '<article class="dsc-card dsc-task" data-id="'+esc(task.id)+'"><span class="dsc-dot '+esc(task.status)+'"></span><div><div class="dsc-name">'+esc(task.title)+'</div><div class="dsc-meta">'+esc(task.assigneeRole)+' · '+esc((task.dependencies || []).length ? "依赖 "+task.dependencies.join(", ") : "无依赖")+'</div></div><span class="dsc-pill">'+esc(statusText(task.status))+'</span></article>').join("") : '<div class="dsc-card">当前筛选没有任务。</div>';
    body.querySelectorAll("[data-id]").forEach(node => node.addEventListener("click", () => { selected = node.dataset.id || ""; renderDetail(snapshot, tasks.find(t => t.id === selected)); }));
    renderDetail(snapshot, tasks.find(t => t.id === selected));
  }
  async function tick(){
    try {
      const res = await fetch(panel.api + "/snapshot", { cache: "no-store" });
      if (res.ok) render(await res.json());
    } catch {}
  }
  tick();
  setInterval(tick, 1500);
})();
</script>`;
  return { style, markup, script };
}

function pixelDashboardOverlayV2(): { style: string; markup: string; script: string } {
  const style = `<style>
:root{--dsc-bg:#f7f8fb;--dsc-panel:#ffffff;--dsc-ink:#18202b;--dsc-muted:#667085;--dsc-soft:#edf1f7;--dsc-line:#d7dde7;--dsc-blue:#2563eb;--dsc-green:#16845b;--dsc-amber:#b7791f;--dsc-red:#c2413b;--dsc-violet:#6d5dfc}
#dsc-cockpit{position:fixed;right:16px;top:16px;bottom:16px;width:min(540px,calc(100vw - 32px));z-index:2147483000;color:var(--dsc-ink);font:13px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;background:rgba(255,255,255,.96);border:1px solid var(--dsc-line);border-radius:8px;box-shadow:0 18px 54px rgba(9,14,24,.24);display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr) auto;overflow:hidden;backdrop-filter:blur(14px)}
#dsc-cockpit *{box-sizing:border-box;letter-spacing:0}
.dsc-top{padding:14px 16px 12px;border-bottom:1px solid var(--dsc-line);background:linear-gradient(180deg,#fff,#f6f8fb)}
.dsc-title-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}
.dsc-kicker{font-size:11px;font-weight:700;color:var(--dsc-violet);text-transform:uppercase}
#dsc-title{font-size:16px;font-weight:750;line-height:1.25;margin-top:3px;overflow-wrap:anywhere}
#dsc-collapse{min-width:44px;min-height:36px;border:1px solid var(--dsc-line);border-radius:6px;background:#fff;color:var(--dsc-ink);font-weight:650;cursor:pointer}
.dsc-sub{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.dsc-chip{border:1px solid var(--dsc-line);border-radius:999px;padding:3px 8px;background:#fff;color:var(--dsc-muted);font-size:12px}
.dsc-chip.running,.dsc-chip.executing{color:#174ea6;background:#eaf1ff;border-color:#c7d7ff}.dsc-chip.awaiting_approval{color:#8a5a00;background:#fff6df;border-color:#f3d28a}.dsc-chip.completed,.dsc-chip.succeeded{color:#126143;background:#e7f7ef;border-color:#b9e7ce}.dsc-chip.blocked,.dsc-chip.failed{color:#9d2d2d;background:#fff0ef;border-color:#f2b9b5}
.dsc-progress-wrap{padding:12px 16px 10px;border-bottom:1px solid var(--dsc-line)}
.dsc-progress-meta{display:flex;justify-content:space-between;color:var(--dsc-muted);font-size:12px;margin-bottom:7px}
.dsc-progress{height:8px;background:#e8edf5;border-radius:999px;overflow:hidden}.dsc-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--dsc-blue),var(--dsc-green));transition:width .35s ease}
.dsc-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsc-line)}
.dsc-metric{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;min-width:0}.dsc-metric b{display:block;font-size:16px}.dsc-metric span{display:block;color:var(--dsc-muted);font-size:11px;margin-top:2px}
.dsc-main{min-height:0;display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--dsc-line)}
.dsc-column{min-width:0;min-height:0;display:flex;flex-direction:column}.dsc-column:first-child{border-right:1px solid var(--dsc-line)}
.dsc-section-head{padding:10px 12px;border-bottom:1px solid var(--dsc-line);display:flex;align-items:center;justify-content:space-between;gap:8px}.dsc-section-head h2{font-size:12px;text-transform:uppercase;margin:0;color:#344054}.dsc-filter{font-size:11px;color:var(--dsc-muted);border:1px solid var(--dsc-line);background:#fff;border-radius:6px;padding:4px 6px;min-height:28px}
#dsc-task-list,#dsc-detail{overflow:auto;padding:10px 12px;min-height:0}.dsc-task-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:start;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;padding:9px;margin-bottom:8px;cursor:pointer;will-change:transform,opacity}.dsc-task-row:hover,.dsc-task-row[aria-selected=true]{border-color:#9db7f8;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
.dsc-dot{width:9px;height:9px;border-radius:99px;margin-top:5px;background:#98a2b3}.dsc-dot.running{background:var(--dsc-blue);box-shadow:0 0 0 4px rgba(37,99,235,.12)}.dsc-dot.needs_review{background:var(--dsc-amber)}.dsc-dot.succeeded{background:var(--dsc-green)}.dsc-dot.failed,.dsc-dot.blocked{background:var(--dsc-red)}
.dsc-task-name{font-weight:700;overflow-wrap:anywhere}.dsc-task-meta{font-size:12px;color:var(--dsc-muted);margin-top:2px;overflow-wrap:anywhere}.dsc-status{font-size:11px;border:1px solid var(--dsc-line);border-radius:999px;padding:2px 7px;color:var(--dsc-muted);white-space:nowrap}
.dsc-role-strip{display:flex;gap:8px;overflow-x:auto;padding:10px 12px;border-bottom:1px solid var(--dsc-line)}.dsc-role{flex:0 0 150px;border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:8px}.dsc-role b{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role span{display:block;color:var(--dsc-muted);font-size:11px;margin-top:2px}
.dsc-detail-title{font-weight:750;font-size:14px;margin-bottom:8px;overflow-wrap:anywhere}.dsc-detail-line{margin:7px 0;color:var(--dsc-muted);overflow-wrap:anywhere}.dsc-detail-line b{color:#344054}.dsc-empty{border:1px dashed #cbd5e1;border-radius:8px;padding:14px;color:var(--dsc-muted);background:#f8fafc}
.dsc-footer{padding:10px 12px;background:#f8fafc;color:var(--dsc-muted);font-size:12px;display:flex;justify-content:space-between;gap:8px}.dsc-footer a{color:#1d4ed8;text-decoration:none}
#dsc-cockpit.dsc-min{grid-template-rows:auto;bottom:auto;height:auto}.dsc-min .dsc-progress-wrap,.dsc-min .dsc-metrics,.dsc-min .dsc-role-strip,.dsc-min .dsc-main,.dsc-min .dsc-footer{display:none}
@media (max-width:760px){#dsc-cockpit{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:68dvh;border-radius:8px;grid-template-rows:auto auto auto minmax(0,1fr) auto}.dsc-metrics{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px}.dsc-role-strip{display:none}.dsc-main{grid-template-columns:1fr}.dsc-column:first-child{border-right:0}.dsc-column:nth-child(2){display:none}.dsc-section-head{padding:9px 10px}#dsc-task-list{padding:9px 10px}.dsc-footer{padding:9px 10px}#dsc-cockpit.dsc-detail-open .dsc-column:nth-child(2){display:flex;position:absolute;inset:64px 0 0;background:#fff;z-index:2}.dsc-detail-open .dsc-column:first-child{display:none}}
@media (prefers-reduced-motion:reduce){.dsc-task-row{will-change:auto}.dsc-progress span{transition:none}}
</style>`;
  const markup = `<section id="dsc-cockpit" aria-label="DeepSeekCode agent cockpit">
  <header class="dsc-top"><div class="dsc-title-row"><div><div class="dsc-kicker">DeepSeekCode Agents</div><div id="dsc-title">Loading run...</div><div class="dsc-sub" id="dsc-sub"></div></div><button id="dsc-collapse" type="button" aria-label="Collapse panel">Hide</button></div></header>
  <div class="dsc-progress-wrap"><div class="dsc-progress-meta"><span id="dsc-progress-label">0/0 completed</span><span id="dsc-next">Waiting</span></div><div class="dsc-progress"><span id="dsc-progress-bar"></span></div></div>
  <div class="dsc-metrics" id="dsc-metrics"></div>
  <div class="dsc-role-strip" id="dsc-roles"></div>
  <div class="dsc-main"><section class="dsc-column"><div class="dsc-section-head"><h2>Task Graph</h2><select id="dsc-filter" class="dsc-filter" aria-label="Task filter"><option value="all">All</option><option value="unfinished">Unfinished</option><option value="running">Running</option><option value="needs_review">Review</option><option value="succeeded">Done</option><option value="blocked">Blocked</option></select></div><div id="dsc-task-list"></div></section><aside class="dsc-column"><div class="dsc-section-head"><h2>Details</h2><button id="dsc-back" class="dsc-filter" type="button">Back</button></div><div id="dsc-detail"></div></aside></div>
  <footer class="dsc-footer"><span id="dsc-updated">Snapshot pending</span><a id="dsc-trace" href="#" target="_blank" rel="noreferrer">trace</a></footer>
</section>`;
  const script = `<script>
(() => {
  const panel = window.DEEPSEEKCODE_PIXEL_PANEL;
  if (!panel) return;
  const token = panel.token || new URLSearchParams(window.location.search).get("token") || "";
  const root = document.getElementById("dsc-cockpit");
  const title = document.getElementById("dsc-title");
  const sub = document.getElementById("dsc-sub");
  const progressLabel = document.getElementById("dsc-progress-label");
  const progressBar = document.getElementById("dsc-progress-bar");
  const next = document.getElementById("dsc-next");
  const connection = document.getElementById("dsc-connection");
  const metrics = document.getElementById("dsc-metrics");
  const roles = document.getElementById("dsc-roles");
  const filter = document.getElementById("dsc-filter");
  const taskList = document.getElementById("dsc-task-list");
  const detail = document.getElementById("dsc-detail");
  const collapse = document.getElementById("dsc-collapse");
  const back = document.getElementById("dsc-back");
  const updated = document.getElementById("dsc-updated");
  const trace = document.getElementById("dsc-trace");
  let selected = "";
  let lastTaskSignature = "";
  let disconnected = false;
  let pollTimer = 0;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function esc(v){return String(v ?? "").replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));}
  function api(path){return panel.api + path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);}
  function statusText(v){return ({queued:"Queued",running:"Running",needs_review:"Review",succeeded:"Done",failed:"Failed",blocked:"Blocked",skipped:"Skipped",paused:"Paused",cancelled:"Cancelled"}[v] || v || "Unknown");}
  function chip(v){return '<span class="dsc-chip '+esc(v)+'">'+esc(v || "unknown")+'</span>';}
  function visible(task){
    const value = filter.value || "all";
    if (value === "all") return true;
    if (value === "unfinished") return !["succeeded","skipped"].includes(task.status);
    if (value === "blocked") return ["blocked","failed"].includes(task.status);
    return task.status === value;
  }
  function animateRows(){
    if (reduceMotion || !window.gsap) return;
    window.gsap.fromTo("#dsc-task-list .dsc-task-row", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.025, ease: "power2.out", overwrite: "auto" });
  }
  function renderDetail(snapshot, task){
    if (!task) {
      const mobile = snapshot.mobileSummary || {};
      detail.innerHTML = '<div class="dsc-empty"><b>Mobile summary</b><div class="dsc-detail-line">'+esc(mobile.nextStep || "Waiting for workflow progress.")+'</div></div>';
      return;
    }
    const role = (snapshot.roles || []).find(r => r.role === task.assigneeRole) || {};
    const skill = (snapshot.generatedSkills || []).find(s => s.id === role.generatedSkillId || s.role === role.role) || {};
    detail.innerHTML =
      '<div class="dsc-detail-title">'+esc(task.title)+'</div>'
      + '<div class="dsc-detail-line"><b>Owner</b> '+esc(task.assigneeRole)+' - '+esc(statusText(task.status))+'</div>'
      + '<div class="dsc-detail-line"><b>Dependencies</b> '+esc((task.dependencies || []).join(", ") || "None")+'</div>'
      + '<div class="dsc-detail-line"><b>Acceptance</b> '+esc((task.acceptanceCriteria || []).join(" | ") || "No criteria yet")+'</div>'
      + '<div class="dsc-detail-line"><b>Evidence</b> '+esc((task.evidence || []).join(" | ") || "No evidence yet")+'</div>'
      + '<div class="dsc-detail-line"><b>Role skill</b> '+esc(skill.summary || role.generatedSkillSummary || "No generated skill summary yet")+'</div>'
      + '<div class="dsc-detail-line"><b>Checkpoint</b> '+esc(role.checkpoint || "No checkpoint yet")+'</div>'
      + (task.blockedBy ? '<div class="dsc-detail-line"><b>Blocked</b> '+esc(task.blockedBy)+'</div>' : '');
  }
  function render(snapshot){
    const tasks = snapshot.subtaskGraph || [];
    const completion = snapshot.completionSummary || { total: tasks.length, succeeded: 0, running: 0, needsReview: 0, blocked: 0, failed: 0, percent: 0 };
    const mobile = snapshot.mobileSummary || {};
    title.textContent = snapshot.overview?.objective || mobile.objective || "DeepSeekCode Agents";
    sub.innerHTML = chip(snapshot.phase || snapshot.overview?.phase) + chip(snapshot.approvalState?.status || "") + chip(mobile.overallProgress || "");
    progressLabel.textContent = (mobile.overallProgress || ((completion.succeeded || 0) + "/" + (completion.total || 0))) + " completed";
    progressBar.style.width = Math.max(0, Math.min(100, completion.percent || 0)) + "%";
    next.textContent = mobile.nextStep || "Waiting";
    metrics.innerHTML = [
      ["Open", Math.max(0, (completion.total || 0) - (completion.succeeded || 0) - (completion.skipped || 0))],
      ["Running", completion.running || 0],
      ["Review", completion.needsReview || 0],
      ["Blocked", (completion.blocked || 0) + (completion.failed || 0)]
    ].map(([label,value]) => '<div class="dsc-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join("");
    roles.innerHTML = (snapshot.roles || []).map(role => '<div class="dsc-role"><b>'+esc(role.role)+'</b><span>'+esc(role.status || "idle")+'</span><span>'+esc(role.currentTask || role.generatedSkillSummary || "")+'</span></div>').join("");
    const shown = tasks.filter(visible);
    const signature = shown.map(t => t.id + ":" + t.status + ":" + (t.lastEvent || "")).join("|");
    taskList.innerHTML = shown.length
      ? shown.map(task => '<button class="dsc-task-row" type="button" data-id="'+esc(task.id)+'" aria-selected="'+(task.id===selected)+'"><span class="dsc-dot '+esc(task.status)+'"></span><span><span class="dsc-task-name">'+esc(task.title)+'</span><span class="dsc-task-meta">'+esc(task.assigneeRole)+' - '+esc((task.dependencies || []).length ? "depends on "+task.dependencies.join(", ") : "no dependencies")+'</span></span><span class="dsc-status">'+esc(statusText(task.status))+'</span></button>').join("")
      : '<div class="dsc-empty">No tasks match this filter. If work is running, check that this link includes a valid token.</div>';
    taskList.querySelectorAll("[data-id]").forEach(node => node.addEventListener("click", () => {
      selected = node.dataset.id || "";
      root.classList.add("dsc-detail-open");
      renderDetail(snapshot, tasks.find(t => t.id === selected));
      taskList.querySelectorAll("[data-id]").forEach(row => row.setAttribute("aria-selected", String(row.dataset.id === selected)));
    }));
    if (!selected && tasks.length) selected = tasks[0].id;
    renderDetail(snapshot, tasks.find(t => t.id === selected));
    updated.textContent = snapshot.generatedAtMs ? "Updated " + new Date(snapshot.generatedAtMs).toLocaleTimeString() : "Snapshot pending";
    trace.href = api("/trace.jsonl");
    if (signature !== lastTaskSignature) animateRows();
    lastTaskSignature = signature;
  }
  async function tick(){
    try {
      const res = await fetch(api("/snapshot"), { cache: "no-store" });
      if (!res.ok) {
        taskList.innerHTML = '<div class="dsc-empty">Snapshot failed: HTTP '+res.status+'. Reopen /agents dashboard share to refresh the token.</div>';
        return;
      }
      render(await res.json());
    } catch (error) {
      taskList.innerHTML = '<div class="dsc-empty">Snapshot failed: '+esc(error && error.message ? error.message : error)+'</div>';
    }
  }
  collapse.addEventListener("click", () => {
    root.classList.toggle("dsc-min");
    collapse.textContent = root.classList.contains("dsc-min") ? "Show" : "Hide";
  });
  back.addEventListener("click", () => root.classList.remove("dsc-detail-open"));
  filter.addEventListener("change", () => tick());
  const gs = document.createElement("script");
  gs.src = "/agent-assets/gsap.min.js";
  gs.onload = () => { if (!reduceMotion && window.gsap) window.gsap.fromTo(root, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }); };
  document.head.appendChild(gs);
  tick();
  setInterval(tick, 1500);
})();
</script>`;
  return { style, markup, script };
}

function pixelDashboardOverlayV3(): { style: string; markup: string; script: string } {
  const style = `<style>
:root{--dsc-bg:#f6f7f9;--dsc-panel:#fff;--dsc-ink:#17202a;--dsc-muted:#5f6b7a;--dsc-soft:#eef2f7;--dsc-line:#d7dee8;--dsc-blue:#2563eb;--dsc-green:#15845b;--dsc-amber:#a66a00;--dsc-red:#c2413b;--dsc-violet:#5b5cf6;--dsc-board:#172318;--dsc-board-line:#34523a}
#dsc-stage-board{position:fixed;left:clamp(72px,7vw,150px);top:64px;width:min(380px,calc(100vw - 760px));max-height:42dvh;z-index:2147482999;color:#e8f5df;background:linear-gradient(180deg,#18261b,#101a13);border:2px solid #6f5530;border-radius:8px;box-shadow:0 14px 34px rgba(0,0,0,.28),inset 0 0 0 1px rgba(255,255,255,.05);padding:14px 14px 12px;pointer-events:none;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;overflow:hidden}
#dsc-stage-board *{box-sizing:border-box;letter-spacing:0}
.dsc-board-title{font-size:15px;font-weight:800;color:#f4ffe8;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px}.dsc-board-title span{color:#9fd6a7;font-weight:650;font-size:12px;white-space:nowrap}
.dsc-board-progress{height:7px;border-radius:999px;background:#26392a;overflow:hidden;margin-bottom:10px}.dsc-board-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#9fd6a7,#7dd3fc);transition:width .35s ease}
.dsc-board-list{display:flex;flex-direction:column;gap:6px}.dsc-board-item{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:start;padding:6px 0;border-top:1px solid var(--dsc-board-line);will-change:transform,opacity}.dsc-board-item:first-child{border-top:0}.dsc-board-dot{width:7px;height:7px;border-radius:99px;margin-top:7px;background:#9fb0a1}.dsc-board-dot.running{background:#7dd3fc}.dsc-board-dot.needs_review{background:#f8d66d}.dsc-board-dot.succeeded{background:#9fd6a7}.dsc-board-dot.failed,.dsc-board-dot.blocked{background:#fca5a5}.dsc-board-name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-board-meta{font-size:12px;color:#b8c8b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-board-status{font-size:12px;color:#d9ead4;white-space:nowrap}
#dsc-cockpit{position:fixed;right:16px;top:16px;bottom:16px;width:min(620px,calc(100vw - 32px));z-index:2147483000;color:var(--dsc-ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;background:rgba(255,255,255,.97);border:1px solid var(--dsc-line);border-radius:8px;box-shadow:0 18px 54px rgba(9,14,24,.24);display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;overflow:hidden;backdrop-filter:blur(14px)}
#dsc-cockpit *{box-sizing:border-box;letter-spacing:0}
.dsc-top{padding:18px 20px 16px;border-bottom:1px solid var(--dsc-line);background:linear-gradient(180deg,#fff,#f7f9fc)}
.dsc-title-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}
.dsc-kicker{font-size:12px;font-weight:800;color:var(--dsc-violet);text-transform:uppercase}
#dsc-title{font-size:22px;font-weight:800;line-height:1.28;margin-top:5px;overflow-wrap:anywhere}
#dsc-collapse{min-width:52px;min-height:44px;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;color:var(--dsc-ink);font-weight:750;cursor:pointer}
.dsc-sub{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.dsc-chip{border:1px solid var(--dsc-line);border-radius:999px;padding:5px 11px;background:#fff;color:var(--dsc-muted);font-size:13px;font-weight:650}
.dsc-chip.running,.dsc-chip.executing{color:#174ea6;background:#eaf1ff;border-color:#c7d7ff}.dsc-chip.awaiting_approval{color:#7a4b00;background:#fff6df;border-color:#f3d28a}.dsc-chip.completed,.dsc-chip.succeeded{color:#126143;background:#e7f7ef;border-color:#b9e7ce}.dsc-chip.blocked,.dsc-chip.failed{color:#9d2d2d;background:#fff0ef;border-color:#f2b9b5}
.dsc-progress-wrap{padding:14px 20px 12px;border-bottom:1px solid var(--dsc-line)}.dsc-progress-meta{display:flex;justify-content:space-between;gap:14px;color:var(--dsc-muted);font-size:14px;margin-bottom:8px}.dsc-progress-meta span:last-child{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-progress{height:9px;background:#e8edf5;border-radius:999px;overflow:hidden}.dsc-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--dsc-blue),var(--dsc-green));transition:width .35s ease}
#dsc-connection{display:none;margin:0;padding:10px 20px;border-bottom:1px solid #f2b9b5;background:#fff1f0;color:#9d2d2d;font-size:14px;font-weight:700}.dsc-offline #dsc-connection{display:block}
.dsc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 20px;border-bottom:1px solid var(--dsc-line);background:#fbfcfe}.dsc-metric{background:#fff;border:1px solid #e0e7f0;border-radius:8px;padding:10px 11px;min-width:0}.dsc-metric b{display:block;font-size:20px;line-height:1.1}.dsc-metric span{display:block;color:var(--dsc-muted);font-size:13px;margin-top:5px}
.dsc-main{min-height:0;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);border-bottom:1px solid var(--dsc-line)}.dsc-column{min-width:0;min-height:0;display:flex;flex-direction:column}.dsc-column:first-child{border-right:1px solid var(--dsc-line)}
.dsc-section-head{padding:12px 16px;border-bottom:1px solid var(--dsc-line);display:flex;align-items:center;justify-content:space-between;gap:10px}.dsc-section-head h2{font-size:14px;margin:0;color:#253044}.dsc-filter{font-size:13px;color:var(--dsc-muted);border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:7px 10px;min-height:36px}
#dsc-task-list,#dsc-detail{overflow:auto;padding:12px 16px;min-height:0}.dsc-task-row{display:grid;grid-template-columns:11px minmax(0,1fr) auto;gap:10px;align-items:start;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;padding:12px;margin-bottom:10px;cursor:pointer;text-align:left;width:100%;will-change:transform,opacity}.dsc-task-row:hover,.dsc-task-row[aria-selected=true]{border-color:#9db7f8;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
.dsc-dot{width:10px;height:10px;border-radius:99px;margin-top:7px;background:#98a2b3}.dsc-dot.running{background:var(--dsc-blue);box-shadow:0 0 0 5px rgba(37,99,235,.12)}.dsc-dot.needs_review{background:var(--dsc-amber)}.dsc-dot.succeeded{background:var(--dsc-green)}.dsc-dot.failed,.dsc-dot.blocked{background:var(--dsc-red)}
.dsc-task-name{font-weight:800;overflow-wrap:anywhere}.dsc-task-meta{font-size:13px;color:var(--dsc-muted);margin-top:4px;overflow-wrap:anywhere}.dsc-status{font-size:13px;border:1px solid var(--dsc-line);border-radius:999px;padding:3px 9px;color:var(--dsc-muted);white-space:nowrap}
.dsc-role-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 20px;border-bottom:1px solid var(--dsc-line);max-height:196px;overflow:auto}.dsc-role{border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:11px;min-width:0}.dsc-role b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role span{display:block;color:var(--dsc-muted);font-size:13px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role.running{border-color:#9db7f8;background:#f6f9ff}.dsc-role.succeeded{border-color:#b9e7ce;background:#f6fff9}.dsc-role.failed,.dsc-role.blocked{border-color:#f2b9b5;background:#fff7f7}
.dsc-detail-title{font-weight:850;font-size:17px;margin-bottom:10px;overflow-wrap:anywhere}.dsc-detail-line{margin:8px 0;color:var(--dsc-muted);overflow-wrap:anywhere}.dsc-detail-line b{color:#253044}.dsc-detail-section{border:1px solid var(--dsc-line);border-radius:8px;background:#fff;margin-top:10px;overflow:hidden}.dsc-detail-section summary{cursor:pointer;padding:10px 12px;font-weight:750;color:#253044}.dsc-detail-section div,.dsc-detail-section pre{padding:0 12px 12px;margin:0;color:var(--dsc-muted);white-space:pre-wrap;overflow-wrap:anywhere}.dsc-detail-section pre{max-height:180px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f8fafc;border-top:1px solid var(--dsc-line);padding-top:10px}
.dsc-empty{border:1px dashed #cbd5e1;border-radius:8px;padding:16px;color:var(--dsc-muted);background:#f8fafc}.dsc-footer{padding:11px 16px;background:#f8fafc;color:var(--dsc-muted);font-size:13px;display:flex;justify-content:space-between;gap:10px}.dsc-footer a{color:#1d4ed8;text-decoration:none}
#dsc-cockpit.dsc-min{grid-template-rows:auto;bottom:auto;height:auto}.dsc-min .dsc-progress-wrap,.dsc-min .dsc-summary,.dsc-min .dsc-role-strip,.dsc-min .dsc-main,.dsc-min .dsc-footer{display:none}
@media (max-width:1180px){#dsc-stage-board{display:none}}
@media (max-width:760px){#dsc-cockpit{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:72dvh;border-radius:8px;grid-template-rows:auto auto auto minmax(0,1fr) auto}.dsc-top{padding:13px 10px 12px 14px}.dsc-title-row{grid-template-columns:minmax(0,1fr) 48px;gap:8px}#dsc-title{font-size:18px}#dsc-collapse{min-width:48px;width:48px;min-height:42px;padding:0;font-size:13px}.dsc-summary{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px 12px}#dsc-connection{padding:9px 12px}.dsc-role-strip{grid-template-columns:1fr 1fr;padding:10px 12px;max-height:132px}.dsc-main{grid-template-columns:1fr}.dsc-column:first-child{border-right:0}.dsc-column:nth-child(2){display:none}.dsc-section-head{padding:10px 12px}#dsc-task-list{padding:10px 12px}.dsc-footer{padding:9px 12px}#dsc-cockpit.dsc-detail-open .dsc-column:nth-child(2){display:flex;position:absolute;inset:58px 0 0;background:#fff;z-index:2}.dsc-detail-open .dsc-column:first-child{display:none}}
@media (prefers-reduced-motion:reduce){.dsc-task-row,.dsc-board-item{will-change:auto}.dsc-progress span,.dsc-board-progress span{transition:none}}
</style>`;
  const markup = `<aside id="dsc-stage-board" aria-label="舞台任务黑板"></aside>
<section id="dsc-cockpit" aria-label="DeepSeekCode 多 Agent 任务驾驶舱">
  <header class="dsc-top"><div class="dsc-title-row"><div><div class="dsc-kicker">DeepSeekCode Agents</div><div id="dsc-title">正在读取任务...</div><div class="dsc-sub" id="dsc-sub"></div></div><button id="dsc-collapse" type="button" aria-label="折叠面板">收起</button></div></header>
  <div class="dsc-progress-wrap"><div class="dsc-progress-meta"><span id="dsc-progress-label">0/0 已完成</span><span id="dsc-next">等待进展</span></div><div class="dsc-progress"><span id="dsc-progress-bar"></span></div></div>
  <div id="dsc-connection" role="status" aria-live="polite"></div>
  <div class="dsc-summary" id="dsc-metrics"></div>
  <div class="dsc-role-strip" id="dsc-roles"></div>
  <div class="dsc-main"><section class="dsc-column"><div class="dsc-section-head"><h2>任务清单</h2><select id="dsc-filter" class="dsc-filter" aria-label="任务筛选"><option value="all">全部</option><option value="unfinished">未完成</option><option value="running">执行中</option><option value="needs_review">待验收</option><option value="succeeded">已完成</option><option value="blocked">失败/阻塞</option></select></div><div id="dsc-task-list"></div></section><aside class="dsc-column"><div class="dsc-section-head"><h2>任务详情</h2><button id="dsc-back" class="dsc-filter" type="button">返回</button></div><div id="dsc-detail"></div></aside></div>
  <footer class="dsc-footer"><span id="dsc-updated">等待 snapshot</span><a id="dsc-trace" href="#" target="_blank" rel="noreferrer">trace</a></footer>
</section>`;
  const script = `<script>
(() => {
  const panel = window.DEEPSEEKCODE_PIXEL_PANEL;
  if (!panel) return;
  const token = panel.token || new URLSearchParams(window.location.search).get("token") || "";
  const root = document.getElementById("dsc-cockpit");
  const board = document.getElementById("dsc-stage-board");
  const title = document.getElementById("dsc-title");
  const sub = document.getElementById("dsc-sub");
  const progressLabel = document.getElementById("dsc-progress-label");
  const progressBar = document.getElementById("dsc-progress-bar");
  const next = document.getElementById("dsc-next");
  const metrics = document.getElementById("dsc-metrics");
  const roles = document.getElementById("dsc-roles");
  const filter = document.getElementById("dsc-filter");
  const taskList = document.getElementById("dsc-task-list");
  const detail = document.getElementById("dsc-detail");
  const collapse = document.getElementById("dsc-collapse");
  const back = document.getElementById("dsc-back");
  const updated = document.getElementById("dsc-updated");
  const trace = document.getElementById("dsc-trace");
  let selected = "";
  let lastTaskSignature = "";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function esc(v){return String(v ?? "").replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));}
  function compact(v,n=96){const s=String(v ?? "").replace(/\\s+/g," ").trim();return s.length>n?s.slice(0,n-1)+"...":s;}
  function api(path){return panel.api + path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);}
  function roleLabel(v){return ({Planner:"规划负责人",AcceptanceReviewer:"验收负责人",ImplementationSpecialist:"实现专家",RuntimeImplementationSpecialist:"运行实现工程师",MotionExperienceBuilder:"动效体验工程师",ExperienceArtifactBuilder:"前端界面工程师",Frontend:"前端工程师",Backend:"后端工程师",Builder:"实现工程师",Tester:"验证工程师",Worker:"执行工程师",Coordinator:"协调员"}[v] || v || "未分配");}
  function statusText(v){return ({queued:"排队中",running:"执行中",needs_review:"待验收",succeeded:"已完成",failed:"失败",blocked:"阻塞",skipped:"已跳过",paused:"等待中",cancelled:"已取消",defined:"待命",idle:"休息中"}[v] || v || "未知");}
  function phaseText(v){return ({planning:"规划中",awaiting_approval:"等待确认",executing:"执行中",reviewing:"验收中",completed:"已完成",blocked:"已阻塞",cancelled:"已取消"}[v] || v || "初始化");}
  function approvalText(v){return ({pending:"待确认",approved:"已批准",rejected:"已拒绝",cancelled:"已取消"}[v] || v || "");}
  function chip(v,cls){return v ? '<span class="dsc-chip '+esc(cls || v)+'">'+esc(v)+'</span>' : "";}
  function markDisconnected(message){
    if(disconnected) return;
    disconnected = true;
    root.classList.add("dsc-offline");
    if(connection) connection.textContent = message || "本机 DeepSeekCode 已断开，页面保留最后一次 snapshot。";
    next.textContent = "连接断开";
    if(pollTimer) clearInterval(pollTimer);
  }
  function connectPanelSocket(){
    try{
      const wsUrl = new URL("/ws", window.location.href);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      wsUrl.searchParams.set("runId", panel.runId);
      wsUrl.searchParams.set("token", token);
      const ws = new window.WebSocket(wsUrl.toString());
      ws.addEventListener("message", event => {
        try{
          const message = JSON.parse(event.data);
          if(message && message.type === "serverShutdown") markDisconnected(message.message || "本机 DeepSeekCode 已关闭，Pixel 页面连接断开。");
        }catch{}
      });
      ws.addEventListener("close", () => markDisconnected("本机 DeepSeekCode 连接已断开，页面保留最后一次状态。"));
      ws.addEventListener("error", () => markDisconnected("本机 DeepSeekCode 连接异常，页面保留最后一次状态。"));
    }catch{}
  }
  function visible(task){const value=filter.value || "all"; if(value==="all")return true; if(value==="unfinished")return !["succeeded","skipped"].includes(task.status); if(value==="blocked")return ["blocked","failed"].includes(task.status); return task.status===value;}
  function roleTaskCount(snapshot, role){return (snapshot.subtaskGraph || []).filter(t => t.assigneeRole === role.role).length;}
  function animateRows(){if(reduceMotion || !window.gsap)return; window.gsap.fromTo("#dsc-task-list .dsc-task-row",{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.22,stagger:.025,ease:"power2.out",overwrite:"auto"}); window.gsap.fromTo("#dsc-stage-board .dsc-board-item",{autoAlpha:0,y:6},{autoAlpha:1,y:0,duration:.22,stagger:.03,ease:"power2.out",overwrite:"auto"});}
  function renderBoard(snapshot){
    const tasks=(snapshot.subtaskGraph||[]).slice();
    const completion=snapshot.completionSummary || {total:tasks.length,succeeded:0,skipped:0,percent:0};
    const focus=tasks.filter(t=>!["succeeded","skipped"].includes(t.status)).slice(0,5);
    const unassigned=tasks.filter(t=>!t.assigneeRole).length;
    board.innerHTML='<div class="dsc-board-title">会议室任务黑板 <span>'+esc((completion.succeeded||0)+(completion.skipped||0))+'/'+esc(completion.total||0)+'</span></div><div class="dsc-board-progress"><span style="width:'+Math.max(0,Math.min(100,completion.percent||0))+'%"></span></div><div class="dsc-board-list">'+(focus.length?focus.map(t=>'<div class="dsc-board-item"><span class="dsc-board-dot '+esc(t.status)+'"></span><span><span class="dsc-board-name">'+esc(compact(t.title,42))+'</span><span class="dsc-board-meta">'+esc(roleLabel(t.assigneeRole))+' · '+esc((t.dependencies||[]).length?("依赖 "+t.dependencies.length):"无依赖")+'</span></span><span class="dsc-board-status">'+esc(statusText(t.status))+'</span></div>').join(""):'<div class="dsc-board-item"><span class="dsc-board-dot succeeded"></span><span><span class="dsc-board-name">暂无未完成任务</span><span class="dsc-board-meta">等待新计划或最终验收</span></span><span class="dsc-board-status">完成</span></div>')+'</div>'+(unassigned?'<div class="dsc-board-meta">未指派任务：'+esc(unassigned)+'</div>':'');
  }
  function renderDetail(snapshot, task){
    if(!task){const mobile=snapshot.mobileSummary||{}; detail.innerHTML='<div class="dsc-empty"><b>手机摘要</b><div class="dsc-detail-line">'+esc(mobile.nextStep || "等待 workflow 进展。")+'</div></div>'; return;}
    const role=(snapshot.roles||[]).find(r=>r.role===task.assigneeRole)||{};
    const skill=(snapshot.generatedSkills||[]).find(s=>s.id===role.generatedSkillId || s.role===role.role)||{};
    const issue=task.blockedBy || role.blockedBy || (role.blockedIssue && (role.blockedIssue.title || role.blockedIssue.firstLine)) || "";
    const raw=[...(role.toolResultSummary||[]), role.lastMessage, role.checkpoint].filter(Boolean).join("\\n");
    detail.innerHTML='<div class="dsc-detail-title">'+esc(task.title)+'</div>'
      + '<div class="dsc-detail-line"><b>负责人</b> '+esc(roleLabel(task.assigneeRole))+' · '+esc(statusText(task.status))+'</div>'
      + '<div class="dsc-detail-line"><b>依赖</b> '+esc((task.dependencies||[]).join(", ") || "无")+'</div>'
      + '<div class="dsc-detail-line"><b>最近事件</b> '+esc(task.lastEvent || role.lastTool || "暂无")+'</div>'
      + '<details class="dsc-detail-section" open><summary>验收标准与 evidence</summary><div><b>验收：</b>'+esc((task.acceptanceCriteria||[]).join(" | ") || "暂无")+'\\n\\n<b>证据：</b>'+esc((task.evidence||[]).join(" | ") || "暂无")+'</div></details>'
      + '<details class="dsc-detail-section"><summary>角色专属 skill</summary><div>'+esc(skill.summary || role.generatedSkillSummary || "暂无 role-local skill 摘要")+'\\n\\n'+esc(skill.prompt || "")+'</div></details>'
      + '<details class="dsc-detail-section"><summary>职责与上下文范围</summary><div>'+esc(role.responsibility || "暂无")+'\\n\\n'+esc(role.contextScope || "暂无")+'</div></details>'
      + (issue ? '<details class="dsc-detail-section" open><summary>错误/阻塞摘要</summary><div>'+esc(issue)+'</div></details>' : '')
      + '<details class="dsc-detail-section"><summary>Checkpoint / 工具摘要 / 原始输出</summary><pre>'+esc(raw || "暂无。代码输出和完整日志只在这里展开查看。")+'</pre></details>';
  }
  function render(snapshot){
    const tasks=snapshot.subtaskGraph || [];
    const completion=snapshot.completionSummary || {total:tasks.length,succeeded:0,skipped:0,running:0,needsReview:0,blocked:0,failed:0,percent:0};
    const mobile=snapshot.mobileSummary || {};
    title.textContent=snapshot.overview?.objective || mobile.objective || "DeepSeekCode 多 Agent";
    sub.innerHTML=chip(phaseText(snapshot.phase || snapshot.overview?.phase), snapshot.phase || "")+chip(approvalText(snapshot.approvalState?.status), snapshot.approvalState?.status || "")+chip(mobile.overallProgress || "");
    progressLabel.textContent=mobile.overallProgress ? mobile.overallProgress+" 已完成" : ((completion.succeeded||0)+(completion.skipped||0))+"/"+(completion.total||0)+" 已完成";
    progressBar.style.width=Math.max(0,Math.min(100,completion.percent||0))+"%";
    next.textContent=mobile.nextStep || "等待下一步";
    metrics.innerHTML=[["未完成",Math.max(0,(completion.total||0)-(completion.succeeded||0)-(completion.skipped||0))],["执行中",completion.running||0],["待验收",completion.needsReview||0],["失败/阻塞",(completion.blocked||0)+(completion.failed||0)]].map(([label,value])=>'<div class="dsc-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join("");
    roles.innerHTML=(snapshot.roles||[]).map(role=>{const count=roleTaskCount(snapshot,role); const line=role.currentTask || (count?("负责 "+count+" 个子任务"):(role.status==="succeeded"?"已完成，回休息区":"待命/休息区")); return '<div class="dsc-role '+esc(role.status||"")+'"><b>'+esc(roleLabel(role.role))+'</b><span>'+esc(statusText(role.status))+'</span><span>'+esc(line)+'</span></div>';}).join("");
    const shown=tasks.filter(visible);
    const signature=shown.map(t=>t.id+":"+t.status+":"+(t.lastEvent||"")).join("|");
    taskList.innerHTML=shown.length?shown.map(task=>'<button class="dsc-task-row" type="button" data-id="'+esc(task.id)+'" aria-selected="'+(task.id===selected)+'"><span class="dsc-dot '+esc(task.status)+'"></span><span><span class="dsc-task-name">'+esc(task.title)+'</span><span class="dsc-task-meta">'+esc(roleLabel(task.assigneeRole))+' · '+esc((task.dependencies||[]).length?("依赖 "+task.dependencies.join(", ")):"无依赖")+'</span></span><span class="dsc-status">'+esc(statusText(task.status))+'</span></button>').join(""):'<div class="dsc-empty">当前筛选没有任务。若任务正在运行，请确认链接 token 仍有效。</div>';
    taskList.querySelectorAll("[data-id]").forEach(node=>node.addEventListener("click",()=>{selected=node.dataset.id||""; root.classList.add("dsc-detail-open"); renderDetail(snapshot,tasks.find(t=>t.id===selected)); taskList.querySelectorAll("[data-id]").forEach(row=>row.setAttribute("aria-selected",String(row.dataset.id===selected)));}));
    if(!selected && tasks.length) selected=tasks[0].id;
    renderDetail(snapshot,tasks.find(t=>t.id===selected));
    renderBoard(snapshot);
    updated.textContent=snapshot.generatedAtMs ? "更新于 "+new Date(snapshot.generatedAtMs).toLocaleTimeString() : "等待 snapshot";
    trace.href=api("/trace.jsonl");
    if(signature!==lastTaskSignature) animateRows();
    lastTaskSignature=signature;
  }
  async function tick(){
    if(disconnected) return;
    try{const res=await fetch(api("/snapshot"),{cache:"no-store"}); if(!res.ok){taskList.innerHTML='<div class="dsc-empty">Snapshot 读取失败：HTTP '+res.status+'。请重新打开 /agents dashboard share 刷新 token。</div>'; return;} render(await res.json());}
    catch(error){markDisconnected("无法连接本机 DeepSeekCode，页面保留最后一次状态。"); taskList.innerHTML='<div class="dsc-empty">Snapshot 读取失败：'+esc(error && error.message ? error.message : error)+'</div>';}
  }
  collapse.addEventListener("click",()=>{root.classList.toggle("dsc-min"); collapse.textContent=root.classList.contains("dsc-min")?"展开":"收起";});
  back.addEventListener("click",()=>root.classList.remove("dsc-detail-open"));
  filter.addEventListener("change",()=>tick());
  const gs=document.createElement("script");
  gs.src="/agent-assets/gsap.min.js";
  gs.onload=()=>{if(!reduceMotion && window.gsap){const tl=window.gsap.timeline({defaults:{duration:.26,ease:"power2.out"}}); tl.fromTo(root,{autoAlpha:0,y:12},{autoAlpha:1,y:0}).fromTo(board,{autoAlpha:0,y:10},{autoAlpha:1,y:0},"<.05");}};
  document.head.appendChild(gs);
  connectPanelSocket();
  tick();
  pollTimer = window.setInterval(tick,1500);
})();
</script>`;
  return { style, markup, script };
}

function pixelDashboardOverlayV4(): { style: string; markup: string; script: string } {
  const style = `<style>
:root{--dsc-bg:#f6f7f9;--dsc-panel:#fff;--dsc-ink:#17202a;--dsc-muted:#5f6b7a;--dsc-soft:#eef2f7;--dsc-line:#d7dee8;--dsc-blue:#2563eb;--dsc-green:#15845b;--dsc-amber:#a66a00;--dsc-red:#c2413b;--dsc-violet:#5b5cf6;--dsc-board:#172318;--dsc-board-line:#34523a}
#dsc-stage-board{position:fixed;left:clamp(76px,7vw,150px);top:64px;width:min(460px,calc(100vw - 760px));max-height:48dvh;z-index:2147482999;color:#e8f5df;background:linear-gradient(180deg,#18261b,#101a13);border:2px solid #6f5530;border-radius:8px;box-shadow:0 14px 34px rgba(0,0,0,.28),inset 0 0 0 1px rgba(255,255,255,.05);padding:14px 14px 12px;pointer-events:none;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;overflow:hidden}
#dsc-stage-board *{box-sizing:border-box;letter-spacing:0}.dsc-board-title{font-size:15px;font-weight:800;color:#f4ffe8;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px}.dsc-board-title span{color:#9fd6a7;font-weight:650;font-size:12px;white-space:nowrap}.dsc-board-progress{height:7px;border-radius:999px;background:#26392a;overflow:hidden;margin-bottom:10px}.dsc-board-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#9fd6a7,#7dd3fc);transition:width .35s ease}.dsc-board-list{display:flex;flex-direction:column;gap:6px}.dsc-board-item{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:start;padding:6px 0;border-top:1px solid var(--dsc-board-line);will-change:transform,opacity}.dsc-board-item:first-child{border-top:0}.dsc-board-dot{width:7px;height:7px;border-radius:99px;margin-top:7px;background:#9fb0a1}.dsc-board-dot.running{background:#7dd3fc}.dsc-board-dot.needs_review{background:#f8d66d}.dsc-board-dot.succeeded{background:#9fd6a7}.dsc-board-dot.failed,.dsc-board-dot.blocked{background:#fca5a5}.dsc-board-name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-board-meta{font-size:12px;color:#b8c8b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-board-status{font-size:12px;color:#d9ead4;white-space:nowrap}
#dsc-room-labels{position:fixed;inset:0;z-index:2147482998;pointer-events:none;font:13px/1.3 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#dce8f8}.dsc-room-label{position:absolute;padding:5px 9px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(15,23,42,.58);box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:nowrap}.dsc-room-work{left:17%;top:33%}.dsc-room-meet{left:40%;top:62%}.dsc-room-rest{left:52%;top:34%}
#dsc-cockpit{position:fixed;right:16px;top:16px;bottom:16px;width:min(620px,calc(100vw - 32px));z-index:2147483000;color:var(--dsc-ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;background:rgba(255,255,255,.97);border:1px solid var(--dsc-line);border-radius:8px;box-shadow:0 18px 54px rgba(9,14,24,.24);display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;overflow:hidden;backdrop-filter:blur(14px)}
#dsc-cockpit *{box-sizing:border-box;letter-spacing:0}.dsc-top{padding:18px 20px 16px;border-bottom:1px solid var(--dsc-line);background:linear-gradient(180deg,#fff,#f7f9fc)}.dsc-title-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}.dsc-kicker{font-size:12px;font-weight:800;color:var(--dsc-violet);text-transform:uppercase}#dsc-title{font-size:22px;font-weight:800;line-height:1.28;margin-top:5px;overflow-wrap:anywhere}#dsc-collapse{min-width:52px;min-height:44px;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;color:var(--dsc-ink);font-weight:750;cursor:pointer}.dsc-sub{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.dsc-chip{border:1px solid var(--dsc-line);border-radius:999px;padding:5px 11px;background:#fff;color:var(--dsc-muted);font-size:13px;font-weight:650}.dsc-chip.running,.dsc-chip.executing{color:#174ea6;background:#eaf1ff;border-color:#c7d7ff}.dsc-chip.awaiting_approval{color:#7a4b00;background:#fff6df;border-color:#f3d28a}.dsc-chip.completed,.dsc-chip.succeeded{color:#126143;background:#e7f7ef;border-color:#b9e7ce}.dsc-chip.blocked,.dsc-chip.failed{color:#9d2d2d;background:#fff0ef;border-color:#f2b9b5}
.dsc-progress-wrap{padding:14px 20px 12px;border-bottom:1px solid var(--dsc-line)}.dsc-progress-meta{display:flex;justify-content:space-between;gap:14px;color:var(--dsc-muted);font-size:14px;margin-bottom:8px}.dsc-progress-meta span:last-child{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-progress{height:9px;background:#e8edf5;border-radius:999px;overflow:hidden}.dsc-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--dsc-blue),var(--dsc-green));transition:width .35s ease}#dsc-connection{display:none;margin:0;padding:10px 20px;border-bottom:1px solid #f2b9b5;background:#fff1f0;color:#9d2d2d;font-size:14px;font-weight:700}.dsc-offline #dsc-connection{display:block}.dsc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 20px;border-bottom:1px solid var(--dsc-line);background:#fbfcfe}.dsc-metric{background:#fff;border:1px solid #e0e7f0;border-radius:8px;padding:10px 11px;min-width:0}.dsc-metric b{display:block;font-size:20px;line-height:1.1}.dsc-metric span{display:block;color:var(--dsc-muted);font-size:13px;margin-top:5px}
.dsc-main{min-height:0;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);border-bottom:1px solid var(--dsc-line)}.dsc-column{min-width:0;min-height:0;display:flex;flex-direction:column}.dsc-column:first-child{border-right:1px solid var(--dsc-line)}.dsc-section-head{padding:12px 16px;border-bottom:1px solid var(--dsc-line);display:flex;align-items:center;justify-content:space-between;gap:10px}.dsc-section-head h2{font-size:14px;margin:0;color:#253044}.dsc-filter{font-size:13px;color:var(--dsc-muted);border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:7px 10px;min-height:36px}#dsc-task-list,#dsc-detail{overflow:auto;padding:12px 16px;min-height:0}.dsc-task-row{display:grid;grid-template-columns:11px minmax(0,1fr) auto;gap:10px;align-items:start;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;padding:12px;margin-bottom:10px;cursor:pointer;text-align:left;width:100%;will-change:transform,opacity}.dsc-task-row:hover,.dsc-task-row[aria-selected=true]{border-color:#9db7f8;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
.dsc-dot{width:10px;height:10px;border-radius:99px;margin-top:7px;background:#98a2b3}.dsc-dot.running{background:var(--dsc-blue);box-shadow:0 0 0 5px rgba(37,99,235,.12)}.dsc-dot.needs_review{background:var(--dsc-amber)}.dsc-dot.succeeded{background:var(--dsc-green)}.dsc-dot.failed,.dsc-dot.blocked{background:var(--dsc-red)}.dsc-task-name{font-weight:800;overflow-wrap:anywhere}.dsc-task-meta{font-size:13px;color:var(--dsc-muted);margin-top:4px;overflow-wrap:anywhere}.dsc-status{font-size:13px;border:1px solid var(--dsc-line);border-radius:999px;padding:3px 9px;color:var(--dsc-muted);white-space:nowrap}.dsc-role-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 20px;border-bottom:1px solid var(--dsc-line);max-height:196px;overflow:auto}.dsc-role{border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:11px;min-width:0}.dsc-role b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role span{display:block;color:var(--dsc-muted);font-size:13px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role.running{border-color:#9db7f8;background:#f6f9ff}.dsc-role.succeeded{border-color:#b9e7ce;background:#f6fff9}.dsc-role.failed,.dsc-role.blocked{border-color:#f2b9b5;background:#fff7f7}
.dsc-detail-title{font-weight:850;font-size:17px;margin-bottom:10px;overflow-wrap:anywhere}.dsc-detail-line{margin:8px 0;color:var(--dsc-muted);overflow-wrap:anywhere}.dsc-detail-line b{color:#253044}.dsc-detail-section{border:1px solid var(--dsc-line);border-radius:8px;background:#fff;margin-top:10px;overflow:hidden}.dsc-detail-section summary{cursor:pointer;padding:10px 12px;font-weight:750;color:#253044}.dsc-detail-section div,.dsc-detail-section pre{padding:0 12px 12px;margin:0;color:var(--dsc-muted);white-space:pre-wrap;overflow-wrap:anywhere}.dsc-detail-section pre{max-height:180px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f8fafc;border-top:1px solid var(--dsc-line);padding-top:10px}.dsc-empty{border:1px dashed #cbd5e1;border-radius:8px;padding:16px;color:var(--dsc-muted);background:#f8fafc}.dsc-footer{padding:11px 16px;background:#f8fafc;color:var(--dsc-muted);font-size:13px;display:flex;justify-content:space-between;gap:10px}.dsc-footer a{color:#1d4ed8;text-decoration:none}#dsc-cockpit.dsc-min{grid-template-rows:auto;bottom:auto;height:auto}.dsc-min .dsc-progress-wrap,.dsc-min .dsc-summary,.dsc-min .dsc-role-strip,.dsc-min .dsc-main,.dsc-min .dsc-footer{display:none}
@media (max-width:1180px){#dsc-stage-board,#dsc-room-labels{display:none}}@media (max-width:760px){#dsc-cockpit{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:72dvh;border-radius:8px;grid-template-rows:auto auto auto minmax(0,1fr) auto}.dsc-top{padding:13px 10px 12px 14px}.dsc-title-row{grid-template-columns:minmax(0,1fr) 48px;gap:8px}#dsc-title{font-size:18px}#dsc-collapse{min-width:48px;width:48px;min-height:42px;padding:0;font-size:13px}.dsc-summary{grid-template-columns:repeat(2,minmax(0,1fr));padding:10px 12px}#dsc-connection{padding:9px 12px}.dsc-role-strip{grid-template-columns:1fr 1fr;padding:10px 12px;max-height:132px}.dsc-main{grid-template-columns:1fr}.dsc-column:first-child{border-right:0}.dsc-column:nth-child(2){display:none}.dsc-section-head{padding:10px 12px}#dsc-task-list{padding:10px 12px}.dsc-footer{padding:9px 12px}#dsc-cockpit.dsc-detail-open .dsc-column:nth-child(2){display:flex;position:absolute;inset:58px 0 0;background:#fff;z-index:2}.dsc-detail-open .dsc-column:first-child{display:none}}@media (prefers-reduced-motion:reduce){.dsc-task-row,.dsc-board-item{will-change:auto}.dsc-progress span,.dsc-board-progress span{transition:none}}
</style>`;
  const markup = `<aside id="dsc-stage-board" aria-label="舞台任务黑板"><div class="dsc-board-title">会议室任务黑板 <span>同步中</span></div><div class="dsc-board-progress"><span></span></div><div class="dsc-board-list"><div class="dsc-board-item"><span class="dsc-board-dot running"></span><span><span class="dsc-board-name">正在读取任务状态</span><span class="dsc-board-meta">如果一直为空，会显示断线原因</span></span><span class="dsc-board-status">同步</span></div></div></aside>
<div id="dsc-room-labels" aria-hidden="true"><span class="dsc-room-label dsc-room-work">工位区</span><span class="dsc-room-label dsc-room-meet">会议桌 / 任务派发</span><span class="dsc-room-label dsc-room-rest">休息区</span></div>
<section id="dsc-cockpit" aria-label="DeepSeekCode 多 Agent 任务驾驶舱">
  <header class="dsc-top"><div class="dsc-title-row"><div><div class="dsc-kicker">DeepSeekCode Agents</div><div id="dsc-title">正在读取任务...</div><div class="dsc-sub" id="dsc-sub"></div></div><button id="dsc-collapse" type="button" aria-label="折叠面板">收起</button></div></header>
  <div class="dsc-progress-wrap"><div class="dsc-progress-meta"><span id="dsc-progress-label">0/0 已完成</span><span id="dsc-next">等待进展</span></div><div class="dsc-progress"><span id="dsc-progress-bar"></span></div></div>
  <div id="dsc-connection" role="status" aria-live="polite"></div>
  <div class="dsc-summary" id="dsc-metrics"></div>
  <div class="dsc-role-strip" id="dsc-roles"></div>
  <div class="dsc-main"><section class="dsc-column"><div class="dsc-section-head"><h2>任务清单</h2><select id="dsc-filter" class="dsc-filter" aria-label="任务筛选"><option value="all">全部</option><option value="unfinished">未完成</option><option value="running">执行中</option><option value="needs_review">待验收</option><option value="succeeded">已完成</option><option value="blocked">失败/阻塞</option></select></div><div id="dsc-task-list"></div></section><aside class="dsc-column"><div class="dsc-section-head"><h2>任务详情</h2><button id="dsc-back" class="dsc-filter" type="button">返回</button></div><div id="dsc-detail"></div></aside></div>
  <footer class="dsc-footer"><span id="dsc-updated">等待 snapshot</span><a id="dsc-trace" href="#" target="_blank" rel="noreferrer">trace</a></footer>
</section>`;
  const script = `<script>
(() => {
  const panel = window.DEEPSEEKCODE_PIXEL_PANEL;
  if (!panel) return;
  const token = panel.token || new URLSearchParams(window.location.search).get("token") || "";
  const root = document.getElementById("dsc-cockpit");
  const board = document.getElementById("dsc-stage-board");
  const title = document.getElementById("dsc-title");
  const sub = document.getElementById("dsc-sub");
  const progressLabel = document.getElementById("dsc-progress-label");
  const progressBar = document.getElementById("dsc-progress-bar");
  const next = document.getElementById("dsc-next");
  const metrics = document.getElementById("dsc-metrics");
  const roles = document.getElementById("dsc-roles");
  const filter = document.getElementById("dsc-filter");
  const taskList = document.getElementById("dsc-task-list");
  const detail = document.getElementById("dsc-detail");
  const connection = document.getElementById("dsc-connection");
  const collapse = document.getElementById("dsc-collapse");
  const back = document.getElementById("dsc-back");
  const updated = document.getElementById("dsc-updated");
  const trace = document.getElementById("dsc-trace");
  let selected = "";
  let lastTaskSignature = "";
  let disconnected = false;
  let pollTimer = 0;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function esc(v){return String(v == null ? "" : v).replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));}
  function compact(v,n){const s=String(v == null ? "" : v).replace(/\\s+/g," ").trim();const limit=n || 96;return s.length>limit?s.slice(0,limit-1)+"...":s;}
  function api(path){return panel.api + path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);}
  function readable(v){const s=String(v == null ? "" : v); if(/Required unknown output|unknown output/i.test(s))return "待重新规划：缺少明确产物"; return s;}
  function roleLabel(v){const raw=String(v || ""); const known={Planner:"规划负责人",AcceptanceReviewer:"验收负责人",ImplementationSpecialist:"实现工程师",RuntimeImplementationSpecialist:"运行修复工程师",MotionExperienceBuilder:"动效体验工程师",ExperienceArtifactBuilder:"前端体验工程师",Frontend:"前端工程师",Backend:"后端工程师",Builder:"实现工程师",Tester:"验证工程师",Worker:"执行工程师",Coordinator:"协调员"}; if(known[raw])return known[raw]; const s=raw.toLowerCase(); if(!raw)return "未分配"; if(/front|ui|web|page|experience|visual/.test(s))return "前端体验工程师"; if(/back|api|server|database|data|db/.test(s))return "后端数据工程师"; if(/motion|gsap|animation|game|canvas/.test(s))return "动效交互工程师"; if(/test|qa|verify|runtime|browser/.test(s))return "运行验证工程师"; if(/doc|office|ppt|pdf|report/.test(s))return "文档交付工程师"; return "任务执行工程师";}
  function statusText(v){return ({queued:"排队中",running:"执行中",needs_review:"待验收",succeeded:"已完成",failed:"失败",blocked:"阻塞",skipped:"已跳过",paused:"等待中",cancelled:"已取消",defined:"待命",idle:"休息中"}[v] || v || "未知");}
  function phaseText(v){return ({planning:"规划中",awaiting_approval:"等待确认",executing:"执行中",reviewing:"验收中",completed:"已完成",blocked:"已阻塞",cancelled:"已取消"}[v] || v || "初始化");}
  function approvalText(v){return ({pending:"待确认",approved:"已批准",rejected:"已拒绝",cancelled:"已取消"}[v] || v || "");}
  function chip(v,cls){return v ? '<span class="dsc-chip '+esc(cls || v)+'">'+esc(v)+'</span>' : "";}
  function markDisconnected(message){if(disconnected)return; disconnected=true; root.classList.add("dsc-offline"); if(connection)connection.textContent=message || "本机 DeepSeekCode 已断开，页面保留最后一次状态。"; next.textContent="连接断开"; if(pollTimer)clearInterval(pollTimer);}
  function connectPanelSocket(){try{const wsUrl=new URL("/ws",window.location.href); wsUrl.protocol=wsUrl.protocol==="https:"?"wss:":"ws:"; wsUrl.searchParams.set("runId",panel.runId); wsUrl.searchParams.set("token",token); const ws=new window.WebSocket(wsUrl.toString()); ws.addEventListener("message",event=>{try{const message=JSON.parse(event.data); if(message && message.type==="serverShutdown")markDisconnected(message.message || "本机 DeepSeekCode 已关闭，Pixel 页面连接断开。");}catch{}}); ws.addEventListener("close",()=>markDisconnected("本机 DeepSeekCode 连接已断开，页面保留最后一次状态。")); ws.addEventListener("error",()=>markDisconnected("本机 DeepSeekCode 连接异常，页面保留最后一次状态。"));}catch{}}
  function visible(task){const value=filter.value || "all"; if(value==="all")return true; if(value==="unfinished")return !["succeeded","skipped"].includes(task.status); if(value==="blocked")return ["blocked","failed"].includes(task.status); return task.status===value;}
  function roleTaskCount(snapshot, role){return (snapshot.subtaskGraph || []).filter(t => t.assigneeRole === role.role).length;}
  function animateRows(){if(reduceMotion || !window.gsap)return; window.gsap.fromTo("#dsc-task-list .dsc-task-row",{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.22,stagger:.025,ease:"power2.out",overwrite:"auto"}); window.gsap.fromTo("#dsc-stage-board .dsc-board-item",{autoAlpha:0,y:6},{autoAlpha:1,y:0,duration:.22,stagger:.03,ease:"power2.out",overwrite:"auto"});}
  function renderBoard(snapshot){const tasks=(snapshot.subtaskGraph||[]).slice(); const completion=snapshot.completionSummary || {total:tasks.length,succeeded:0,skipped:0,percent:0}; const focus=tasks.filter(t=>!["succeeded","skipped"].includes(t.status)).slice(0,5); const unassigned=tasks.filter(t=>!t.assigneeRole).length; board.innerHTML='<div class="dsc-board-title">会议室任务黑板 <span>'+esc((completion.succeeded||0)+(completion.skipped||0))+'/'+esc(completion.total||0)+'</span></div><div class="dsc-board-progress"><span style="width:'+Math.max(0,Math.min(100,completion.percent||0))+'%"></span></div><div class="dsc-board-list">'+(focus.length?focus.map(t=>'<div class="dsc-board-item"><span class="dsc-board-dot '+esc(t.status)+'"></span><span><span class="dsc-board-name">'+esc(compact(readable(t.title),42))+'</span><span class="dsc-board-meta">'+esc(roleLabel(t.assigneeRole))+' · '+esc((t.dependencies||[]).length?("依赖 "+t.dependencies.length):"无依赖")+'</span></span><span class="dsc-board-status">'+esc(statusText(t.status))+'</span></div>').join(""):(tasks.length?'<div class="dsc-board-item"><span class="dsc-board-dot succeeded"></span><span><span class="dsc-board-name">暂无未完成任务</span><span class="dsc-board-meta">等待最终验收或新计划</span></span><span class="dsc-board-status">完成</span></div>':'<div class="dsc-board-item"><span class="dsc-board-dot running"></span><span><span class="dsc-board-name">等待 workflow snapshot</span><span class="dsc-board-meta">会自动追踪本项目 active workflow</span></span><span class="dsc-board-status">同步</span></div>'))+'</div>'+(unassigned?'<div class="dsc-board-meta">未指派任务：'+esc(unassigned)+'</div>':'');}
  function renderDetail(snapshot, task){if(!task){const mobile=snapshot.mobileSummary||{}; detail.innerHTML='<div class="dsc-empty"><b>手机摘要</b><div class="dsc-detail-line">'+esc(mobile.nextStep || "等待 workflow 进展。")+'</div></div>'; return;} const role=(snapshot.roles||[]).find(r=>r.role===task.assigneeRole)||{}; const skill=(snapshot.generatedSkills||[]).find(s=>s.id===role.generatedSkillId || s.role===role.role)||{}; const issue=task.blockedBy || role.blockedBy || (role.blockedIssue && (role.blockedIssue.title || role.blockedIssue.firstLine)) || ""; const raw=[...(role.toolResultSummary||[]), role.lastMessage, role.checkpoint].filter(Boolean).join("\\n"); detail.innerHTML='<div class="dsc-detail-title">'+esc(readable(task.title))+'</div>'+'<div class="dsc-detail-line"><b>负责人</b> '+esc(roleLabel(task.assigneeRole))+' · '+esc(statusText(task.status))+'</div>'+'<div class="dsc-detail-line"><b>依赖</b> '+esc((task.dependencies||[]).join(", ") || "无")+'</div>'+'<div class="dsc-detail-line"><b>最近事件</b> '+esc(readable(task.lastEvent || role.lastTool || "暂无"))+'</div>'+'<details class="dsc-detail-section" open><summary>验收标准与 evidence</summary><div><b>验收：</b>'+esc((task.acceptanceCriteria||[]).map(readable).join(" | ") || "暂无")+'\\n\\n<b>证据：</b>'+esc((task.evidence||[]).map(readable).join(" | ") || "暂无")+'</div></details>'+'<details class="dsc-detail-section"><summary>角色专属 skill</summary><div>'+esc(readable(skill.summary || role.generatedSkillSummary || "暂无 role-local skill 摘要"))+'\\n\\n'+esc(readable(skill.prompt || ""))+'</div></details>'+'<details class="dsc-detail-section"><summary>职责与上下文范围</summary><div>'+esc(readable(role.responsibility || "暂无"))+'\\n\\n'+esc(readable(role.contextScope || "暂无"))+'</div></details>'+(issue?'<details class="dsc-detail-section" open><summary>错误/阻塞摘要</summary><div>'+esc(readable(issue))+'</div></details>':'')+'<details class="dsc-detail-section"><summary>Checkpoint / 工具摘要 / 原始输出</summary><pre>'+esc(readable(raw || "暂无。代码输出和完整日志只在这里展开查看。"))+'</pre></details>';}
  function render(snapshot){const tasks=snapshot.subtaskGraph || []; const completion=snapshot.completionSummary || {total:tasks.length,succeeded:0,skipped:0,running:0,needsReview:0,blocked:0,failed:0,percent:0}; const mobile=snapshot.mobileSummary || {}; title.textContent=readable(snapshot.overview?.objective || mobile.objective || "DeepSeekCode 多 Agent"); sub.innerHTML=chip(phaseText(snapshot.phase || snapshot.overview?.phase), snapshot.phase || "")+chip(approvalText(snapshot.approvalState?.status), snapshot.approvalState?.status || "")+chip(mobile.overallProgress || ""); progressLabel.textContent=mobile.overallProgress ? mobile.overallProgress+" 已完成" : ((completion.succeeded||0)+(completion.skipped||0))+"/"+(completion.total||0)+" 已完成"; progressBar.style.width=Math.max(0,Math.min(100,completion.percent||0))+"%"; next.textContent=mobile.nextStep || "等待下一步"; metrics.innerHTML=[["未完成",Math.max(0,(completion.total||0)-(completion.succeeded||0)-(completion.skipped||0))],["执行中",completion.running||0],["待验收",completion.needsReview||0],["失败/阻塞",(completion.blocked||0)+(completion.failed||0)]].map(([label,value])=>'<div class="dsc-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join(""); roles.innerHTML=(snapshot.roles||[]).map(role=>{const count=roleTaskCount(snapshot,role); const line=role.currentTask || (count?("负责 "+count+" 个子任务"):(role.status==="succeeded"?"已完成，回到休息区":"待命/休息区")); return '<div class="dsc-role '+esc(role.status||"")+'"><b>'+esc(roleLabel(role.role))+'</b><span>'+esc(statusText(role.status))+'</span><span>'+esc(readable(line))+'</span></div>';}).join(""); const shown=tasks.filter(visible); const signature=shown.map(t=>t.id+":"+t.status+":"+(t.lastEvent||"")).join("|"); taskList.innerHTML=shown.length?shown.map(task=>'<button class="dsc-task-row" type="button" data-id="'+esc(task.id)+'" aria-selected="'+(task.id===selected)+'"><span class="dsc-dot '+esc(task.status)+'"></span><span><span class="dsc-task-name">'+esc(readable(task.title))+'</span><span class="dsc-task-meta">'+esc(roleLabel(task.assigneeRole))+' · '+esc((task.dependencies||[]).length?("依赖 "+task.dependencies.join(", ")):"无依赖")+'</span></span><span class="dsc-status">'+esc(statusText(task.status))+'</span></button>').join(""):'<div class="dsc-empty">当前没有任务数据。若任务正在运行，面板会自动追踪本项目 active workflow；如果仍为空，请看上方断线提示或重新打开 /agents dashboard。</div>'; taskList.querySelectorAll("[data-id]").forEach(node=>node.addEventListener("click",()=>{selected=node.dataset.id||""; root.classList.add("dsc-detail-open"); renderDetail(snapshot,tasks.find(t=>t.id===selected)); taskList.querySelectorAll("[data-id]").forEach(row=>row.setAttribute("aria-selected",String(row.dataset.id===selected)));})); if(!selected && tasks.length) selected=tasks[0].id; renderDetail(snapshot,tasks.find(t=>t.id===selected)); renderBoard(snapshot); updated.textContent=snapshot.generatedAtMs ? "更新于 "+new Date(snapshot.generatedAtMs).toLocaleTimeString() : "等待 snapshot"; trace.href=api("/trace.jsonl"); if(signature!==lastTaskSignature)animateRows(); lastTaskSignature=signature;}
  async function tick(){if(disconnected)return; try{const res=await fetch(api("/snapshot"),{cache:"no-store"}); if(!res.ok){taskList.innerHTML='<div class="dsc-empty">Snapshot 读取失败：HTTP '+res.status+'。请重新打开 /agents dashboard share 刷新 token。</div>'; return;} render(await res.json());}catch(error){markDisconnected("无法连接本机 DeepSeekCode，页面保留最后一次状态。"); taskList.innerHTML='<div class="dsc-empty">Snapshot 读取失败：'+esc(error && error.message ? error.message : error)+'</div>';}}
  collapse.addEventListener("click",()=>{root.classList.toggle("dsc-min"); collapse.textContent=root.classList.contains("dsc-min")?"展开":"收起";});
  back.addEventListener("click",()=>root.classList.remove("dsc-detail-open"));
  filter.addEventListener("change",()=>tick());
  const gs=document.createElement("script"); gs.src="/agent-assets/gsap.min.js"; gs.onload=()=>{if(!reduceMotion && window.gsap){const tl=window.gsap.timeline({defaults:{duration:.26,ease:"power2.out"}}); tl.fromTo(root,{autoAlpha:0,y:12},{autoAlpha:1,y:0}).fromTo(board,{autoAlpha:0,y:10},{autoAlpha:1,y:0},"<.05");}}; document.head.appendChild(gs);
  connectPanelSocket();
  tick();
  pollTimer=window.setInterval(tick,1500);
})();
</script>`;
  return { style, markup, script };
}

function pixelDashboardOverlayV5(): { style: string; markup: string; script: string } {
  const style = `<style>
:root{--dsc-panel-w:clamp(600px,44vw,840px);--dsc-pad:clamp(12px,1.8vw,28px);--dsc-gap:10px;--dsc-board-h:clamp(118px,16vh,168px);--dsc-feed-h:clamp(82px,10vh,108px);--dsc-ink:#17202a;--dsc-muted:#5f6b7a;--dsc-line:#d7dee8;--dsc-blue:#2563eb;--dsc-green:#15845b;--dsc-amber:#a66a00;--dsc-red:#c2413b;--dsc-violet:#5b5cf6}
html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#151625!important}
body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
#root{position:fixed!important;left:var(--dsc-pad);top:calc(var(--dsc-pad) + var(--dsc-board-h) + var(--dsc-gap));bottom:calc(var(--dsc-pad) + var(--dsc-feed-h) + var(--dsc-gap));right:calc(var(--dsc-panel-w) + var(--dsc-pad));width:auto!important;height:auto!important;overflow:hidden!important;border:1px solid rgba(221,230,244,.28);border-radius:8px}
#root canvas,#root img{image-rendering:pixelated}
#root [title*="Zoom"],#root .absolute.top-8.left-8.z-10,#root .absolute.bottom-10.left-10.z-20,#root .absolute.bottom-8.right-28.z-20,#root [style*="z-index: 41"][style*="pointer-events: none"]{display:none!important}
#root canvas.block{width:100%!important;height:100%!important;object-fit:cover;transform:scale(1.08);transform-origin:center center;will-change:transform}
#dsc-war-room{position:fixed;left:0;top:0;bottom:0;right:var(--dsc-panel-w);z-index:2147482998;pointer-events:none;color:#edf6ff;overflow:hidden;display:grid;grid-template-rows:var(--dsc-board-h) minmax(0,1fr) var(--dsc-feed-h);gap:var(--dsc-gap);padding:var(--dsc-pad)}
#dsc-war-room::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 34% 34%,rgba(38,74,93,.18),transparent 34%),linear-gradient(90deg,rgba(8,12,24,.08),rgba(8,12,24,.42));pointer-events:none}
#dsc-stage-board{position:relative;z-index:2;grid-row:1;width:100%;height:100%;max-height:none;color:#e8f5df;background:linear-gradient(180deg,#17281c,#101a13);border:2px solid #8a6836;border-radius:8px;box-shadow:0 16px 38px rgba(0,0,0,.32),inset 0 0 0 1px rgba(255,255,255,.05);padding:14px 16px 12px;overflow:hidden}
#dsc-stage-board *{box-sizing:border-box;letter-spacing:0}.dsc-board-title{font-size:17px;font-weight:850;color:#f4ffe8;margin-bottom:7px;display:flex;align-items:center;justify-content:space-between;gap:12px}.dsc-board-title span{color:#9fd6a7;font-size:13px;white-space:nowrap}.dsc-board-progress{height:7px;border-radius:999px;background:#26392a;overflow:hidden;margin-bottom:8px}.dsc-board-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#9fd6a7,#7dd3fc);transition:width .35s ease}.dsc-board-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 14px}.dsc-board-item{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:start;padding:5px 0;border-top:1px solid #34523a}.dsc-board-item:nth-child(-n+2){border-top:0}.dsc-board-dot{width:8px;height:8px;border-radius:99px;margin-top:7px;background:#9fb0a1}.dsc-board-dot.running{background:#7dd3fc;box-shadow:0 0 0 5px rgba(125,211,252,.15);animation:dsc-pulse 1.15s infinite}.dsc-board-dot.needs_review{background:#f8d66d}.dsc-board-dot.succeeded{background:#9fd6a7}.dsc-board-dot.failed,.dsc-board-dot.blocked{background:#fca5a5}.dsc-board-name{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-board-meta{font-size:12px;color:#b8c8b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-board-status{font-size:12px;color:#d9ead4;white-space:nowrap}
#dsc-stage-zones,#dsc-role-layer,#dsc-flow-svg{position:absolute;left:var(--dsc-pad);right:var(--dsc-pad);top:calc(var(--dsc-pad) + var(--dsc-board-h) + var(--dsc-gap));bottom:calc(var(--dsc-pad) + var(--dsc-feed-h) + var(--dsc-gap));z-index:3}.dsc-zone{position:absolute;border:1px solid rgba(226,232,240,.32);background:rgba(15,23,42,.20);border-radius:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}.dsc-zone strong{position:absolute;left:10px;top:8px;font-size:13px;color:#dce8f8;text-shadow:0 1px 2px #000}.dsc-zone-work{left:5%;top:7%;width:42%;height:86%}.dsc-zone-meet{left:42%;top:16%;width:23%;height:72%}.dsc-zone-rest{right:0;top:7%;width:31%;height:86%}.dsc-zone-work::after{content:"";position:absolute;left:8px;right:8px;top:34px;height:2px;background:linear-gradient(90deg,transparent,#7dd3fc,transparent);opacity:.45;animation:dsc-scan 2.2s ease-in-out infinite}
#dsc-role-layer{pointer-events:none}.dsc-avatar-chip{position:absolute;transform:translate(-50%,-50%);min-width:150px;max-width:220px;padding:8px 10px 9px;border:1px solid rgba(221,230,244,.55);border-radius:8px;background:rgba(17,24,39,.82);box-shadow:0 12px 28px rgba(0,0,0,.28);backdrop-filter:blur(6px);color:#f8fbff}.dsc-avatar-chip::before{content:"";position:absolute;left:10px;top:-13px;width:15px;height:15px;border-radius:4px;background:#f8fbff;border:2px solid currentColor;box-shadow:0 2px 0 rgba(0,0,0,.24)}.dsc-avatar-chip.running{border-color:#8bb7ff;background:rgba(18,39,75,.88);animation:dsc-breathe 1.35s ease-in-out infinite}.dsc-avatar-chip.running::after{content:"";position:absolute;inset:-5px;border:1px solid rgba(125,211,252,.45);border-radius:10px;animation:dsc-ring 1.35s ease-out infinite}.dsc-avatar-chip.succeeded,.dsc-avatar-chip.defined{background:rgba(20,44,35,.78);border-color:rgba(157,214,167,.62)}.dsc-avatar-chip.blocked,.dsc-avatar-chip.failed{background:rgba(68,21,27,.86);border-color:rgba(252,165,165,.72)}.dsc-avatar-name{display:block;font-weight:850;font-size:13px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dsc-avatar-status{display:block;margin-top:3px;font-size:12px;color:#c9d6e4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dsc-avatar-task{display:block;margin-top:2px;font-size:11px;color:#aebbd0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#dsc-stage-feed{position:relative;z-index:4;grid-row:3;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;align-items:stretch}.dsc-feed-card{min-width:0;min-height:0;border:1px solid rgba(221,230,244,.34);border-radius:8px;background:rgba(13,21,38,.92);box-shadow:0 12px 26px rgba(0,0,0,.22),inset 0 0 0 1px rgba(255,255,255,.04);padding:11px 12px;color:#dbe8f7}.dsc-feed-card b{display:block;font-size:13px;color:#f8fbff;margin-bottom:7px}.dsc-feed-card span{display:block;font-size:12px;color:#bccce0;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-feed-pill{display:inline-flex!important;align-items:center;margin:0 5px 5px 0;padding:3px 7px;border:1px solid rgba(125,211,252,.34);border-radius:999px;color:#dff7ff!important;background:rgba(17,60,89,.45);max-width:100%}
#dsc-flow-svg{width:auto;height:auto;overflow:visible}.dsc-flow-line{stroke:#7dd3fc;stroke-width:2;vector-effect:non-scaling-stroke;stroke-dasharray:6 8;opacity:.46;animation:dsc-dash 1.1s linear infinite}.dsc-task-token{position:absolute;width:9px;height:9px;border-radius:99px;background:#7dd3fc;box-shadow:0 0 14px rgba(125,211,252,.8);animation:dsc-float 2.8s ease-in-out infinite}
#dsc-cockpit{position:fixed;right:0;top:0;bottom:0;width:var(--dsc-panel-w);z-index:2147483000;color:var(--dsc-ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;background:rgba(255,255,255,.985);border-left:1px solid var(--dsc-line);box-shadow:-18px 0 54px rgba(9,14,24,.24);display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;overflow:hidden}
#dsc-cockpit *{box-sizing:border-box;letter-spacing:0}.dsc-top{padding:20px 24px 18px;border-bottom:1px solid var(--dsc-line);background:linear-gradient(180deg,#fff,#f7f9fc)}.dsc-title-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start}.dsc-kicker{font-size:12px;font-weight:850;color:var(--dsc-violet);text-transform:uppercase}#dsc-title{font-size:24px;font-weight:850;line-height:1.28;margin-top:6px;overflow-wrap:anywhere}#dsc-collapse{min-width:58px;min-height:44px;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;color:var(--dsc-ink);font-weight:780;cursor:pointer}.dsc-sub{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.dsc-chip{border:1px solid var(--dsc-line);border-radius:999px;padding:5px 11px;background:#fff;color:var(--dsc-muted);font-size:13px;font-weight:700}.dsc-chip.running,.dsc-chip.executing{color:#174ea6;background:#eaf1ff;border-color:#c7d7ff}.dsc-chip.awaiting_approval{color:#7a4b00;background:#fff6df;border-color:#f3d28a}.dsc-chip.completed,.dsc-chip.succeeded{color:#126143;background:#e7f7ef;border-color:#b9e7ce}.dsc-chip.blocked,.dsc-chip.failed{color:#9d2d2d;background:#fff0ef;border-color:#f2b9b5}
.dsc-progress-wrap{padding:14px 24px 12px;border-bottom:1px solid var(--dsc-line)}.dsc-progress-meta{display:flex;justify-content:space-between;gap:14px;color:var(--dsc-muted);font-size:14px;margin-bottom:8px}.dsc-progress-meta span:last-child{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-progress{height:9px;background:#e8edf5;border-radius:999px;overflow:hidden}.dsc-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--dsc-blue),var(--dsc-green));transition:width .35s ease}#dsc-connection{display:none;margin:0;padding:10px 24px;border-bottom:1px solid #f2b9b5;background:#fff1f0;color:#9d2d2d;font-size:14px;font-weight:750}.dsc-offline #dsc-connection{display:block}.dsc-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 24px;border-bottom:1px solid var(--dsc-line);background:#fbfcfe}.dsc-metric{background:#fff;border:1px solid #e0e7f0;border-radius:8px;padding:10px 12px;min-width:0}.dsc-metric b{display:block;font-size:21px;line-height:1.1}.dsc-metric span{display:block;color:var(--dsc-muted);font-size:13px;margin-top:5px}
.dsc-main{min-height:0;display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);border-bottom:1px solid var(--dsc-line)}.dsc-column{min-width:0;min-height:0;display:flex;flex-direction:column}.dsc-column:first-child{border-right:1px solid var(--dsc-line)}.dsc-section-head{padding:12px 18px;border-bottom:1px solid var(--dsc-line);display:flex;align-items:center;justify-content:space-between;gap:10px}.dsc-section-head h2{font-size:15px;margin:0;color:#253044}.dsc-filter{font-size:13px;color:var(--dsc-muted);border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:7px 10px;min-height:36px}#dsc-task-list,#dsc-detail{overflow:auto;padding:12px 18px;min-height:0}.dsc-task-row{display:grid;grid-template-columns:11px minmax(0,1fr) auto;gap:10px;align-items:start;border:1px solid var(--dsc-line);border-radius:8px;background:#fff;padding:12px;margin-bottom:10px;cursor:pointer;text-align:left;width:100%;will-change:transform,opacity}.dsc-task-row:hover,.dsc-task-row[aria-selected=true]{border-color:#9db7f8;box-shadow:0 0 0 3px rgba(37,99,235,.1)}
.dsc-dot{width:10px;height:10px;border-radius:99px;margin-top:7px;background:#98a2b3}.dsc-dot.running{background:var(--dsc-blue);box-shadow:0 0 0 5px rgba(37,99,235,.12);animation:dsc-pulse 1.15s infinite}.dsc-dot.needs_review{background:var(--dsc-amber)}.dsc-dot.succeeded{background:var(--dsc-green)}.dsc-dot.failed,.dsc-dot.blocked{background:var(--dsc-red)}.dsc-task-name{font-weight:850;overflow-wrap:anywhere}.dsc-task-meta{font-size:13px;color:var(--dsc-muted);margin-top:4px;overflow-wrap:anywhere}.dsc-status{font-size:13px;border:1px solid var(--dsc-line);border-radius:999px;padding:3px 9px;color:var(--dsc-muted);white-space:nowrap}.dsc-role-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 24px;border-bottom:1px solid var(--dsc-line);max-height:198px;overflow:auto}.dsc-role{border:1px solid var(--dsc-line);background:#fff;border-radius:8px;padding:11px;min-width:0}.dsc-role b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role span{display:block;color:var(--dsc-muted);font-size:13px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-role.running{border-color:#9db7f8;background:#f6f9ff}.dsc-role.succeeded{border-color:#b9e7ce;background:#f6fff9}.dsc-role.failed,.dsc-role.blocked{border-color:#f2b9b5;background:#fff7f7}
.dsc-detail-title{font-weight:850;font-size:17px;margin-bottom:10px;overflow-wrap:anywhere}.dsc-detail-line{margin:8px 0;color:var(--dsc-muted);overflow-wrap:anywhere}.dsc-detail-line b{color:#253044}.dsc-detail-section{border:1px solid var(--dsc-line);border-radius:8px;background:#fff;margin-top:10px;overflow:hidden}.dsc-detail-section summary{cursor:pointer;padding:10px 12px;font-weight:750;color:#253044}.dsc-detail-section div,.dsc-detail-section pre{padding:0 12px 12px;margin:0;color:var(--dsc-muted);white-space:pre-wrap;overflow-wrap:anywhere}.dsc-detail-section pre{max-height:180px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f8fafc;border-top:1px solid var(--dsc-line);padding-top:10px}.dsc-empty{border:1px dashed #cbd5e1;border-radius:8px;padding:16px;color:var(--dsc-muted);background:#f8fafc}.dsc-footer{padding:11px 18px;background:#f8fafc;color:var(--dsc-muted);font-size:13px;display:flex;justify-content:space-between;gap:10px}.dsc-footer a{color:#1d4ed8;text-decoration:none}#dsc-cockpit.dsc-min{grid-template-rows:auto;bottom:auto;height:auto}.dsc-min .dsc-progress-wrap,.dsc-min .dsc-summary,.dsc-min .dsc-role-strip,.dsc-min .dsc-main,.dsc-min .dsc-footer{display:none}
@keyframes dsc-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.76}}@keyframes dsc-breathe{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.035)}}@keyframes dsc-ring{0%{opacity:.72;transform:scale(.98)}100%{opacity:0;transform:scale(1.16)}}@keyframes dsc-dash{to{stroke-dashoffset:-28}}@keyframes dsc-scan{0%,100%{transform:translateY(0);opacity:.22}50%{transform:translateY(70px);opacity:.55}}@keyframes dsc-float{0%,100%{transform:translateY(0);opacity:.65}50%{transform:translateY(-7px);opacity:1}}
@media (max-width:1180px){:root{--dsc-panel-w:clamp(520px,48vw,720px);--dsc-board-h:clamp(112px,15vh,150px);--dsc-feed-h:86px}#dsc-stage-board{max-height:none}.dsc-board-list{grid-template-columns:1fr}.dsc-zone strong{font-size:12px}.dsc-avatar-chip{min-width:132px;max-width:176px}#dsc-stage-feed{grid-template-columns:1fr 1fr}.dsc-feed-card:nth-child(3){display:none}}
@media (max-width:820px){:root{--dsc-panel-w:100vw;--dsc-mobile-stage:clamp(168px,24dvh,220px)}#root{display:none!important}#dsc-war-room{right:0;bottom:auto;height:var(--dsc-mobile-stage);padding:10px;display:block;background:#151625;overflow:hidden}#dsc-war-room::before{background:linear-gradient(180deg,rgba(8,12,24,.08),rgba(8,12,24,.72))}#dsc-stage-board{position:absolute;left:10px;right:10px;top:10px;width:auto;height:calc(var(--dsc-mobile-stage) - 68px);max-height:none;padding:9px 10px;border-radius:8px}.dsc-board-title{font-size:14px}.dsc-board-progress{margin-bottom:6px}.dsc-board-list{grid-template-columns:1fr;gap:3px}.dsc-board-item{padding:4px 0}.dsc-board-item:nth-child(n+4){display:none}.dsc-board-name{white-space:nowrap}.dsc-board-meta,.dsc-board-status{font-size:11px}.dsc-zone,#dsc-flow-svg,#dsc-stage-feed{display:none}#dsc-role-layer{position:absolute;left:10px;right:10px;top:auto;bottom:7px;height:48px;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;z-index:5;scrollbar-width:none}#dsc-role-layer::-webkit-scrollbar{display:none}.dsc-avatar-chip{position:relative!important;left:auto!important;top:auto!important;transform:none!important;flex:0 0 auto;min-width:126px;max-width:172px;height:46px;padding:5px 8px}.dsc-avatar-chip::before,.dsc-avatar-chip::after,.dsc-task-token{display:none!important}.dsc-avatar-name{font-size:12px}.dsc-avatar-status{font-size:11px;margin-top:2px}.dsc-avatar-task{display:none}#dsc-cockpit{left:0;right:0;top:var(--dsc-mobile-stage);bottom:0;width:100vw;height:auto;border-left:0;border-top:1px solid var(--dsc-line);grid-template-rows:auto auto auto minmax(0,1fr) auto}.dsc-top{padding:10px 12px 9px}.dsc-title-row{grid-template-columns:minmax(0,1fr) 52px;gap:8px}#dsc-title{font-size:17px;line-height:1.22;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}#dsc-collapse{min-width:52px;width:52px;min-height:40px;padding:0;font-size:13px}.dsc-sub{margin-top:8px}.dsc-progress-wrap{padding:8px 12px}.dsc-summary{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:8px 12px}.dsc-metric{padding:7px 6px}.dsc-metric b{font-size:16px}.dsc-metric span{font-size:12px}.dsc-role-strip{display:none}.dsc-main{grid-template-columns:1fr}.dsc-column:first-child{border-right:0}.dsc-column:nth-child(2){display:none}.dsc-section-head{padding:8px 12px}#dsc-task-list{padding:8px 12px}.dsc-task-row{padding:9px;margin-bottom:7px}.dsc-footer{padding:8px 12px}#dsc-cockpit.dsc-detail-open .dsc-column:nth-child(2){display:flex;position:absolute;inset:48px 0 0;background:#fff;z-index:2}.dsc-detail-open .dsc-column:first-child{display:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>`;
  const markup = `<div id="dsc-war-room" aria-hidden="true">
  <aside id="dsc-stage-board"><div class="dsc-board-title">会议室任务黑板 <span>同步中</span></div><div class="dsc-board-progress"><span></span></div><div class="dsc-board-list"><div class="dsc-board-item"><span class="dsc-board-dot running"></span><span><span class="dsc-board-name">正在读取任务状态</span><span class="dsc-board-meta">角色、工位、任务会自动同步</span></span><span class="dsc-board-status">同步</span></div></div></aside>
  <div id="dsc-stage-zones"><div class="dsc-zone dsc-zone-work"><strong>工位区</strong></div><div class="dsc-zone dsc-zone-meet"><strong>会议派发</strong></div><div class="dsc-zone dsc-zone-rest"><strong>休息区</strong></div></div>
  <svg id="dsc-flow-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
  <div id="dsc-role-layer"></div>
  <aside id="dsc-stage-feed"></aside>
</div>
<section id="dsc-cockpit" aria-label="DeepSeekCode 多 Agent 任务驾驶舱">
  <header class="dsc-top"><div class="dsc-title-row"><div><div class="dsc-kicker">DeepSeekCode Agents</div><div id="dsc-title">正在读取任务...</div><div class="dsc-sub" id="dsc-sub"></div></div><button id="dsc-collapse" type="button" aria-label="收起面板">收起</button></div></header>
  <div class="dsc-progress-wrap"><div class="dsc-progress-meta"><span id="dsc-progress-label">0/0 已完成</span><span id="dsc-next">等待进展</span></div><div class="dsc-progress"><span id="dsc-progress-bar"></span></div></div>
  <div id="dsc-connection" role="status" aria-live="polite"></div>
  <div class="dsc-summary" id="dsc-metrics"></div>
  <div class="dsc-role-strip" id="dsc-roles"></div>
  <div class="dsc-main"><section class="dsc-column"><div class="dsc-section-head"><h2>任务清单</h2><select id="dsc-filter" class="dsc-filter" aria-label="任务筛选"><option value="all">全部</option><option value="unfinished">未完成</option><option value="running">执行中</option><option value="needs_review">待验收</option><option value="succeeded">已完成</option><option value="blocked">失败/阻塞</option></select></div><div id="dsc-task-list"></div></section><aside class="dsc-column"><div class="dsc-section-head"><h2>任务详情</h2><button id="dsc-back" class="dsc-filter" type="button">返回</button></div><div id="dsc-detail"></div></aside></div>
  <footer class="dsc-footer"><span id="dsc-updated">等待 snapshot</span><a id="dsc-trace" href="#" target="_blank" rel="noreferrer">trace</a></footer>
</section>`;
  const script = `<script>
(() => {
  const panel = window.DEEPSEEKCODE_PIXEL_PANEL;
  if (!panel) return;
  const token = panel.token || new URLSearchParams(window.location.search).get("token") || "";
  const root = document.getElementById("dsc-cockpit");
  const board = document.getElementById("dsc-stage-board");
  const flowSvg = document.getElementById("dsc-flow-svg");
  const roleLayer = document.getElementById("dsc-role-layer");
  const stageFeed = document.getElementById("dsc-stage-feed");
  const title = document.getElementById("dsc-title");
  const sub = document.getElementById("dsc-sub");
  const progressLabel = document.getElementById("dsc-progress-label");
  const progressBar = document.getElementById("dsc-progress-bar");
  const next = document.getElementById("dsc-next");
  const metrics = document.getElementById("dsc-metrics");
  const roles = document.getElementById("dsc-roles");
  const filter = document.getElementById("dsc-filter");
  const taskList = document.getElementById("dsc-task-list");
  const detail = document.getElementById("dsc-detail");
  const connection = document.getElementById("dsc-connection");
  const collapse = document.getElementById("dsc-collapse");
  const back = document.getElementById("dsc-back");
  const updated = document.getElementById("dsc-updated");
  const trace = document.getElementById("dsc-trace");
  let selected = "";
  let lastTaskSignature = "";
  let disconnected = false;
  let pollTimer = 0;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const workSlots = [[22,49],[34,48],[26,67],[41,66],[47,52]];
  const meetSlots = [[55,60],[49,70],[62,70],[56,50]];
  const restSlots = [[70,45],[80,53],[72,67],[84,66]];
  const issueSlots = [[51,32],[61,34]];
  function esc(v){return String(v == null ? "" : v).replace(/[&<>"]/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[ch]));}
  function compact(v,n){const s=String(v == null ? "" : v).replace(/\\s+/g," ").trim();const limit=n || 96;return s.length>limit?s.slice(0,limit-1)+"...":s;}
  function api(path){return panel.api + path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);}
  function readable(v){const s=String(v == null ? "" : v); if(/Required unknown output|unknown output/i.test(s))return "待重新规划：缺少明确产物"; return s;}
  function isChinese(v){return /[\\u4e00-\\u9fff]/.test(String(v || ""));}
  function roleLabel(v){const raw=String(v || ""); if(isChinese(raw))return raw; const known={Planner:"规划负责人",AcceptanceReviewer:"验收负责人",ImplementationSpecialist:"实现工程师",RuntimeImplementationSpecialist:"运行修复工程师",MotionExperienceBuilder:"动效体验工程师",ExperienceArtifactBuilder:"前端体验工程师",Frontend:"前端工程师",Backend:"后端工程师",Builder:"实现工程师",Tester:"验证工程师",Worker:"执行工程师",Coordinator:"协调员"}; if(known[raw])return known[raw]; const s=raw.toLowerCase(); if(!raw)return "未分配"; if(/front|ui|web|page|experience|visual/.test(s))return "前端体验工程师"; if(/back|api|server|database|data|db/.test(s))return "后端数据工程师"; if(/motion|gsap|animation|game|canvas/.test(s))return "动效交互工程师"; if(/test|qa|verify|runtime|browser/.test(s))return "运行验证工程师"; if(/doc|office|ppt|pdf|report/.test(s))return "文档交付工程师"; return "任务执行工程师";}
  function statusText(v){return ({queued:"排队中",running:"执行中",needs_review:"待验收",succeeded:"已完成",failed:"失败",blocked:"阻塞",skipped:"已跳过",paused:"等待中",cancelled:"已取消",defined:"待命",idle:"休息中"}[v] || v || "未知");}
  function phaseText(v){return ({planning:"规划中",awaiting_approval:"等待确认",executing:"执行中",reviewing:"验收中",completed:"已完成",blocked:"已阻塞",cancelled:"已取消"}[v] || v || "初始化");}
  function approvalText(v){return ({pending:"待确认",approved:"已批准",rejected:"已拒绝",cancelled:"已取消"}[v] || v || "");}
  function chip(v,cls){return v ? '<span class="dsc-chip '+esc(cls || v)+'">'+esc(v)+'</span>' : "";}
  function markDisconnected(message){if(disconnected)return; disconnected=true; root.classList.add("dsc-offline"); if(connection)connection.textContent=message || "本机 DeepSeekCode 已断开，页面保留最后一次状态。"; next.textContent="连接断开"; if(pollTimer)clearInterval(pollTimer);}
  function connectPanelSocket(){try{const wsUrl=new URL("/ws",window.location.href); wsUrl.protocol=wsUrl.protocol==="https:"?"wss:":"ws:"; wsUrl.searchParams.set("runId",panel.runId); wsUrl.searchParams.set("token",token); const ws=new window.WebSocket(wsUrl.toString()); ws.addEventListener("message",event=>{try{const message=JSON.parse(event.data); if(message && message.type==="serverShutdown")markDisconnected(message.message || "本机 DeepSeekCode 已关闭，Pixel 页面连接断开。");}catch{}}); ws.addEventListener("close",()=>markDisconnected("本机 DeepSeekCode 连接已断开，页面保留最后一次状态。")); ws.addEventListener("error",()=>markDisconnected("本机 DeepSeekCode 连接异常，页面保留最后一次状态。"));}catch{}}
  function hidePixelChrome(){document.querySelectorAll("button").forEach(button=>{const text=(button.textContent||"").trim(); const label=(button.getAttribute("aria-label")||"").toLowerCase(); const titleText=(button.getAttribute("title")||"").toLowerCase(); if(["+","−","-","Layout","Settings"].includes(text) || /zoom|layout|settings/.test(label+" "+titleText)){button.classList.add("dsc-native-hidden"); button.style.display="none"; const parent=button.parentElement; if(parent && parent.querySelectorAll("button").length <= 2 && /Layout|Settings|\\+|−|-/.test(parent.textContent||"")) parent.style.display="none";}}); document.querySelectorAll("#root [style*='z-index: 41'][style*='pointer-events: none'],#root .absolute.bottom-8.right-28.z-20").forEach(node=>{node.style.display="none";});}
  function zoneFor(role,snapshot){const model=snapshot && snapshot.layoutModel && snapshot.layoutModel.roleLocations ? snapshot.layoutModel.roleLocations[role.role] : ""; if(model==="workbench")return "work"; if(model==="dispatch"||model==="review")return "meet"; if(model==="blocked")return "issue"; if(model==="lounge")return "rest"; const name=String(role.role||""); const status=role.status; if(status==="failed"||status==="blocked"||role.blockedBy)return "issue"; if(status==="running"||role.currentTask){ if(/planner|规划/i.test(name) || /review|验收|acceptance/i.test(name)) return "meet"; return "work"; } if(status==="paused" || status==="needs_review")return "meet"; return "rest";}
  function pointFor(zone,index){const list=zone==="work"?workSlots:zone==="meet"?meetSlots:zone==="issue"?issueSlots:restSlots; return list[index % list.length];}
  function renderStage(snapshot){const roleItems=(snapshot.roles||[]); const tasks=(snapshot.subtaskGraph||[]); const roleHtml=roleItems.map((role,index)=>{const zone=zoneFor(role,snapshot); const p=pointFor(zone,index); const task=role.currentTask || tasks.find(t=>t.assigneeRole===role.role && !["succeeded","skipped"].includes(t.status))?.title || (zone==="rest"?"休息区待命":"等待派发"); return '<div class="dsc-avatar-chip '+esc(role.status||"")+" zone-"+zone+'" style="left:'+p[0]+'%;top:'+p[1]+'%"><span class="dsc-avatar-name">'+esc(roleLabel(role.role))+'</span><span class="dsc-avatar-status">'+esc(statusText(role.status))+' · '+(zone==="work"?"工位区":zone==="meet"?"会议区":zone==="issue"?"阻塞区":"休息区")+'</span><span class="dsc-avatar-task">'+esc(compact(readable(task),34))+'</span></div>';}).join(""); roleLayer.innerHTML=roleHtml; const running=roleItems.map((role,index)=>{const zone=zoneFor(role,snapshot); return {role,index,zone,point:pointFor(zone,index)};}).filter(item=>item.zone==="work"||item.zone==="meet"||item.zone==="issue"); flowSvg.innerHTML=running.map(item=>'<line class="dsc-flow-line" x1="22" y1="16" x2="'+item.point[0]+'" y2="'+item.point[1]+'"></line>').join(""); roleLayer.insertAdjacentHTML("beforeend", running.slice(0,5).map((item,i)=>'<span class="dsc-task-token" style="left:'+((22+item.point[0])/2 + i*1.2)+'%;top:'+((16+item.point[1])/2 + i*1.2)+'%"></span>').join(""));}
  function visible(task){const value=filter.value || "all"; if(value==="all")return true; if(value==="unfinished")return !["succeeded","skipped"].includes(task.status); if(value==="blocked")return ["blocked","failed"].includes(task.status); return task.status===value;}
  function roleTaskCount(snapshot, role){return (snapshot.subtaskGraph || []).filter(t => t.assigneeRole === role.role).length;}
  function animateSelector(selector, from, to){if(reduceMotion || !window.gsap || !document.querySelector(selector))return; window.gsap.fromTo(selector,from,to);}
  function animateRows(){animateSelector("#dsc-task-list .dsc-task-row",{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.22,stagger:.025,ease:"power2.out",overwrite:"auto"}); animateSelector("#dsc-stage-board .dsc-board-item",{autoAlpha:0,y:6},{autoAlpha:1,y:0,duration:.22,stagger:.03,ease:"power2.out",overwrite:"auto"}); animateSelector("#dsc-role-layer .dsc-avatar-chip",{autoAlpha:0,y:7},{autoAlpha:1,y:0,duration:.24,stagger:.025,ease:"power2.out",overwrite:"auto"});}
  function renderBoard(snapshot){const tasks=(snapshot.subtaskGraph||[]).slice(); const readyIds=new Set((snapshot.readyQueue||[]).map(item=>item.id)); const completion=snapshot.completionSummary || {total:tasks.length,succeeded:0,skipped:0,percent:0}; const focus=tasks.filter(t=>!["succeeded","skipped"].includes(t.status)).sort((a,b)=>(readyIds.has(b.id)?1:0)-(readyIds.has(a.id)?1:0)).slice(0,6); const unassigned=tasks.filter(t=>!t.assigneeRole).length; board.innerHTML='<div class="dsc-board-title">会议室任务黑板 <span>'+esc((completion.succeeded||0)+(completion.skipped||0))+'/'+esc(completion.total||0)+'</span></div><div class="dsc-board-progress"><span style="width:'+Math.max(0,Math.min(100,completion.percent||0))+'%"></span></div><div class="dsc-board-list">'+(focus.length?focus.map(t=>'<div class="dsc-board-item"><span class="dsc-board-dot '+esc(t.status)+'"></span><span><span class="dsc-board-name">'+esc(compact(readable(t.title),42))+'</span><span class="dsc-board-meta">'+esc(roleLabel(t.assigneeRole))+' · '+esc(readyIds.has(t.id)?"可执行":((t.dependencies||[]).length?("依赖 "+t.dependencies.length):"无依赖"))+'</span></span><span class="dsc-board-status">'+esc(statusText(t.status))+'</span></div>').join(""):(tasks.length?'<div class="dsc-board-item"><span class="dsc-board-dot succeeded"></span><span><span class="dsc-board-name">暂无未完成任务</span><span class="dsc-board-meta">等待最终验收或新计划</span></span><span class="dsc-board-status">完成</span></div>':'<div class="dsc-board-item"><span class="dsc-board-dot running"></span><span><span class="dsc-board-name">等待 workflow snapshot</span><span class="dsc-board-meta">会自动追踪本项目 active workflow</span></span><span class="dsc-board-status">同步</span></div>'))+'</div>'+(unassigned?'<div class="dsc-board-meta">未指派任务：'+esc(unassigned)+'</div>':'');}
  function renderStageFeed(snapshot){const timeline=(snapshot.timeline||[]).slice(-3).reverse(); const evidence=((snapshot.evidence||[]).length?snapshot.evidence:snapshot.artifacts||[]).slice(-3).reverse(); const processes=(snapshot.processes||[]).filter(p=>p.status==="running").slice(0,3); const cache=snapshot.cacheSummary||{}; const eventLines=timeline.length?timeline.map(e=>'<span>'+esc(compact([roleLabel(e.role), e.tool, e.message || e.kind].filter(Boolean).join(" · "),54))+'</span>').join(""):'<span>等待最新事件</span>'; const evidenceLines=evidence.length?evidence.map(a=>'<span class="dsc-feed-pill">'+esc(a.kind || "evidence")+'</span><span>'+esc(compact(a.path || a.url || a.summary || "",46))+'</span>').join(""):'<span>暂无产物 evidence</span>'; const runtimeLines=[processes.length?processes.map(p=>'<span>'+esc(compact((p.url||p.command||"进程")+" · pid "+p.pid,48))+'</span>').join(""):'<span>暂无运行中的项目进程</span>', cache.cacheHitRate==null?'':'<span>缓存命中 '+esc(Math.round(cache.cacheHitRate*100))+'%</span>'].join(""); stageFeed.innerHTML='<div class="dsc-feed-card"><b>最新事件</b>'+eventLines+'</div><div class="dsc-feed-card"><b>产物 / Evidence</b>'+evidenceLines+'</div><div class="dsc-feed-card"><b>运行 / 缓存</b>'+runtimeLines+'</div>';}
  function renderDetail(snapshot, task){if(!task){const mobile=snapshot.mobileSummary||{}; detail.innerHTML='<div class="dsc-empty"><b>手机摘要</b><div class="dsc-detail-line">'+esc(mobile.nextStep || "等待 workflow 进展。")+'</div></div>'; return;} const role=(snapshot.roles||[]).find(r=>r.role===task.assigneeRole)||{}; const skill=(snapshot.generatedSkills||[]).find(s=>s.id===role.generatedSkillId || s.role===role.role)||{}; const issue=task.blockedBy || role.blockedBy || (role.blockedIssue && (role.blockedIssue.title || role.blockedIssue.firstLine)) || ""; const raw=[...(role.toolResultSummary||[]), role.lastMessage, role.checkpoint].filter(Boolean).join("\\n"); detail.innerHTML='<div class="dsc-detail-title">'+esc(readable(task.title))+'</div>'+'<div class="dsc-detail-line"><b>负责人</b> '+esc(roleLabel(task.assigneeRole))+' · '+esc(statusText(task.status))+'</div>'+'<div class="dsc-detail-line"><b>依赖</b> '+esc((task.dependencies||[]).join(", ") || "无")+'</div>'+'<div class="dsc-detail-line"><b>最近事件</b> '+esc(readable(task.lastEvent || role.lastTool || "暂无"))+'</div>'+'<details class="dsc-detail-section" open><summary>验收标准与 evidence</summary><div><b>验收：</b>'+esc((task.acceptanceCriteria||[]).map(readable).join(" | ") || "暂无")+'\\n\\n<b>证据：</b>'+esc((task.evidence||[]).map(readable).join(" | ") || "暂无")+'</div></details>'+'<details class="dsc-detail-section"><summary>角色专属 skill</summary><div>'+esc(readable(skill.summary || role.generatedSkillSummary || "暂无 role-local skill 摘要"))+'\\n\\n'+esc(readable(skill.prompt || ""))+'</div></details>'+'<details class="dsc-detail-section"><summary>职责与上下文范围</summary><div>'+esc(readable(role.responsibility || "暂无"))+'\\n\\n'+esc(readable(role.contextScope || "暂无"))+'</div></details>'+(issue?'<details class="dsc-detail-section" open><summary>错误/阻塞摘要</summary><div>'+esc(readable(issue))+'</div></details>':'')+'<details class="dsc-detail-section"><summary>Checkpoint / 工具摘要 / 原始输出</summary><pre>'+esc(readable(raw || "暂无。代码输出和完整日志只在这里展开查看。"))+'</pre></details>';}
  function render(snapshot){hidePixelChrome(); renderStage(snapshot); renderStageFeed(snapshot); const tasks=snapshot.subtaskGraph || []; const completion=snapshot.completionSummary || {total:tasks.length,succeeded:0,skipped:0,running:0,needsReview:0,blocked:0,failed:0,percent:0}; const mobile=snapshot.mobileSummary || {}; title.textContent=readable(snapshot.overview?.objective || mobile.objective || "DeepSeekCode 多 Agent"); sub.innerHTML=chip(phaseText(snapshot.phase || snapshot.overview?.phase), snapshot.phase || "")+chip(approvalText(snapshot.approvalState?.status), snapshot.approvalState?.status || "")+chip(mobile.overallProgress || ""); progressLabel.textContent=mobile.overallProgress ? mobile.overallProgress+" 已完成" : ((completion.succeeded||0)+(completion.skipped||0))+"/"+(completion.total||0)+" 已完成"; progressBar.style.width=Math.max(0,Math.min(100,completion.percent||0))+"%"; next.textContent=mobile.nextStep || "等待下一步"; metrics.innerHTML=[["未完成",Math.max(0,(completion.total||0)-(completion.succeeded||0)-(completion.skipped||0))],["执行中",completion.running||0],["待验收",completion.needsReview||0],["失败/阻塞",(completion.blocked||0)+(completion.failed||0)]].map(([label,value])=>'<div class="dsc-metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join(""); roles.innerHTML=(snapshot.roles||[]).map(role=>{const count=roleTaskCount(snapshot,role); const zone=zoneFor(role); const line=role.currentTask || (count?("负责 "+count+" 个子任务"):(zone==="rest"?"休息区待命":"等待派发")); return '<div class="dsc-role '+esc(role.status||"")+'"><b>'+esc(roleLabel(role.role))+'</b><span>'+esc(statusText(role.status))+' · '+esc(zone==="work"?"工位区":zone==="meet"?"会议区":zone==="issue"?"阻塞区":"休息区")+'</span><span>'+esc(readable(line))+'</span></div>';}).join(""); const shown=tasks.filter(visible); const signature=shown.map(t=>t.id+":"+t.status+":"+(t.lastEvent||"")).join("|"); taskList.innerHTML=shown.length?shown.map(task=>'<button class="dsc-task-row" type="button" data-id="'+esc(task.id)+'" aria-selected="'+(task.id===selected)+'"><span class="dsc-dot '+esc(task.status)+'"></span><span><span class="dsc-task-name">'+esc(readable(task.title))+'</span><span class="dsc-task-meta">'+esc(roleLabel(task.assigneeRole))+' · '+esc((task.dependencies||[]).length?("依赖 "+task.dependencies.join(", ")):"无依赖")+'</span></span><span class="dsc-status">'+esc(statusText(task.status))+'</span></button>').join(""):'<div class="dsc-empty">当前没有任务数据。若任务正在运行，面板会自动追踪本项目 active workflow；如果仍为空，请查看断线提示或重新打开 /agents dashboard。</div>'; taskList.querySelectorAll("[data-id]").forEach(node=>node.addEventListener("click",()=>{selected=node.dataset.id||""; root.classList.add("dsc-detail-open"); renderDetail(snapshot,tasks.find(t=>t.id===selected)); taskList.querySelectorAll("[data-id]").forEach(row=>row.setAttribute("aria-selected",String(row.dataset.id===selected)));})); if(!selected && tasks.length) selected=tasks[0].id; renderDetail(snapshot,tasks.find(t=>t.id===selected)); renderBoard(snapshot); updated.textContent=snapshot.generatedAtMs ? "更新于 "+new Date(snapshot.generatedAtMs).toLocaleTimeString() : "等待 snapshot"; trace.href=api("/trace.jsonl"); if(signature!==lastTaskSignature)animateRows(); lastTaskSignature=signature;}
  async function tick(){if(disconnected)return; try{const res=await fetch(api("/snapshot"),{cache:"no-store"}); if(!res.ok){taskList.innerHTML='<div class="dsc-empty">Snapshot 读取失败：HTTP '+res.status+'。请重新打开 /agents dashboard share 刷新 token。</div>'; return;} render(await res.json());}catch(error){markDisconnected("无法连接本机 DeepSeekCode，页面保留最后一次状态。"); taskList.innerHTML='<div class="dsc-empty">Snapshot 读取失败：'+esc(error && error.message ? error.message : error)+'</div>';}}
  collapse.addEventListener("click",()=>{root.classList.toggle("dsc-min"); collapse.textContent=root.classList.contains("dsc-min")?"展开":"收起";});
  back.addEventListener("click",()=>root.classList.remove("dsc-detail-open"));
  filter.addEventListener("change",()=>tick());
  const gs=document.createElement("script"); gs.src="/agent-assets/gsap.min.js"; gs.onload=()=>{if(!reduceMotion && window.gsap){animateSelector("#dsc-cockpit",{autoAlpha:0,x:18},{autoAlpha:1,x:0,duration:.28,ease:"power2.out"}); animateSelector("#dsc-stage-board",{autoAlpha:0,y:10},{autoAlpha:1,y:0,duration:.28,ease:"power2.out"}); animateSelector("#dsc-role-layer .dsc-avatar-chip",{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.24,stagger:.04,ease:"power2.out"});}}; document.head.appendChild(gs);
  window.setInterval(hidePixelChrome,1200);
  hidePixelChrome();
  connectPanelSocket();
  tick();
  pollTimer=window.setInterval(tick,1500);
})();
</script>`;
  return { style, markup, script };
}

function pixelMessagesFromSnapshot(snapshot: AgentDashboardSnapshot): PixelMessage[] {
  const messages: PixelMessage[] = [];
  const ids = roleIds(snapshot.roles);
  const roles = rolesForSnapshot(snapshot);
  for (let index = 0; index < roles.length; index++) {
    const role = roles[index];
    const id = ids[index] ?? index + 1;
    const active = isRoleActive(role);
    messages.push({
      type: "agentTeamInfo",
      id,
      teamName: "DeepSeekCode",
      agentName: displayRoleName(role.role),
      isTeamLead: index === 0,
      leadAgentId: ids[0] ?? 1,
      teamUsesTmux: false,
    });
    messages.push({ type: "agentStatus", id, status: active ? "active" : "waiting" });
    messages.push({ type: "agentToolsClear", id });

    const toolItems = toolItemsForRole(role, snapshot.timeline);
    for (let toolIndex = 0; toolIndex < toolItems.length; toolIndex++) {
      messages.push({
        type: "agentToolStart",
        id,
        toolId: `dsc-${id}-${toolIndex}-${hashText(toolItems[toolIndex].status)}`,
        toolName: toolItems[toolIndex].toolName,
        status: toolItems[toolIndex].status,
        permissionActive: toolItems[toolIndex].permissionActive,
        runInBackground: true,
      });
      if (toolItems[toolIndex].done) {
        messages.push({
          type: "agentToolDone",
          id,
          toolId: `dsc-${id}-${toolIndex}-${hashText(toolItems[toolIndex].status)}`,
        });
      }
    }
    messages.push({ type: "agentTokenUsage", id, inputTokens: 0, outputTokens: 0 });
  }
  messages.push({
    type: "workflowTaskGraph",
    workflowId: snapshot.workflow?.id,
    phase: snapshot.phase,
    approvalState: snapshot.approvalState,
    rolePlan: snapshot.rolePlan,
    subtasks: snapshot.subtaskGraph,
    generatedSkills: snapshot.generatedSkills,
    completionSummary: snapshot.completionSummary,
    mobileSummary: snapshot.mobileSummary,
    connectionState: snapshot.connectionState,
    serverHeartbeat: snapshot.serverHeartbeat,
    processes: snapshot.processes,
    cacheSummary: snapshot.cacheSummary,
    tokenBudget: snapshot.tokenBudget,
    readyQueue: snapshot.readyQueue,
    evidence: snapshot.evidence,
    layoutModel: snapshot.layoutModel,
    offlineReason: snapshot.offlineReason,
  });
  messages.push({
    type: "agentDiagnostics",
    workflow: snapshot.agentDiagnostics,
    agents: roles.map((role, index) => ({
      id: ids[index] ?? index + 1,
      role: role.role,
      responsibility: role.responsibility,
      contextScope: role.contextScope,
      status: role.status,
      currentTask: role.currentTask,
      assignedTasks: role.assignedTasks,
      completedTasks: role.completedTasks,
      blockedBy: role.blockedBy,
      issue: role.blockedIssue,
      lastTool: role.lastTool,
      lastMessage: role.lastMessage,
      checkpoint: role.checkpoint,
      transcript: role.transcript,
      toolResultSummary: role.toolResultSummary,
      skills: role.skills,
      tools: role.tools,
      acceptance: role.acceptance,
      requiredOutputs: role.requiredOutputs,
      riskChecks: role.riskChecks,
      handoffFormat: role.handoffFormat,
      generatedSkillId: role.generatedSkillId,
      generatedSkillSummary: role.generatedSkillSummary,
    })),
  });
  return messages;
}

function rolesForSnapshot(snapshot: AgentDashboardSnapshot): AgentDashboardRole[] {
  if (snapshot.roles.length) return snapshot.roles;
  const defaultRoles = [
    ["Planner", "生成可审查计划、任务图和角色分工。"],
    ["任务执行角色", "等待任务契约生成具体动态角色。"],
    ["AcceptanceReviewer", "按真实 evidence 验收子任务和最终结果。"],
  ];
  return defaultRoles.map(([role, responsibility]) => ({
    role,
    responsibility,
    status: "defined",
    assignedTasks: [],
    completedTasks: [],
    transcript: [],
    toolResultSummary: [],
    skills: [],
    tools: [],
    acceptance: [],
    requiredOutputs: [],
    riskChecks: [],
  }));
}

function roleIds(roles: AgentDashboardRole[]): number[] {
  const count = Math.max(roles.length, roles.length ? roles.length : 3);
  return Array.from({ length: count }, (_, index) => index + 1);
}

function isRoleActive(role: AgentDashboardRole): boolean {
  return role.status === "running" || role.status === "paused";
}

function toolItemsForRole(role: AgentDashboardRole, timeline: AgentDashboardTimelineEvent[]): {
  toolName: string;
  status: string;
  permissionActive?: boolean;
  done?: boolean;
}[] {
  const items: { toolName: string; status: string; permissionActive?: boolean; done?: boolean }[] = [];
  items.push({ toolName: "状态", status: shortStatusLabel(role), done: !isRoleActive(role) });
  if (role.currentTask) {
    items.push({ toolName: "任务", status: compact(role.currentTask, 36) });
  }
  if (role.lastTool) {
    items.push({ toolName: localizedToolName(role.lastTool), status: compact(localizedToolName(role.lastTool), 32), done: role.status === "succeeded" });
  }
  if (role.blockedIssue) {
    const issue = role.blockedIssue;
    const title = localizedText(issue.title) || issue.firstLine || role.blockedBy || "需要处理";
    items.push({
      toolName: "问题",
      status: compact(title, 42),
      permissionActive: /permission|权限|approval|gate/i.test(title),
    });
  } else if (role.blockedBy) {
    items.push({ toolName: "问题", status: compact(role.blockedBy, 42) });
  }
  const roleEvents = timeline.filter((event) => event.role === role.role).slice(-1);
  for (const event of roleEvents) {
    const label = event.message ?? event.task ?? event.tool ?? event.kind;
    items.push({ toolName: localizedToolName(event.tool ?? event.kind), status: compact(label, 40), done: /succeed|done|finished|message/i.test(event.status ?? event.kind) });
  }
  return items.slice(0, 4);
}

function shortStatusLabel(role: AgentDashboardRole): string {
  if (role.blockedBy || role.blockedIssue) return /permission|approval|gate|权限|确认/i.test(role.blockedBy ?? "") ? "等待确认" : "已阻塞";
  if (role.status === "running") {
    if (/test|qa|verify|验证|测试/i.test(role.role)) return "验证中";
    if (/review|accept|验收|审查/i.test(role.role)) return "验收中";
    if (/plan|planner|coordinator|规划|计划/i.test(role.role)) return "规划中";
    if (/front|ui|web|page|前端|界面|动效|玩法/i.test(role.role)) return "构建体验";
    if (/back|api|server|cli|后端|接口|命令行/i.test(role.role)) return "构建逻辑";
    return "执行中";
  }
  if (role.status === "paused") return "等待中";
  if (role.status === "failed") return "失败";
  if (role.status === "succeeded") return "已完成";
  return "休息中";
}

function displayRoleName(role: string): string {
  const names: Record<string, string> = {
    Planner: "规划负责人",
    AcceptanceReviewer: "验收负责人",
    ImplementationSpecialist: "实现专家",
    RuntimeImplementationSpecialist: "运行实现工程师",
    MotionExperienceBuilder: "动效体验工程师",
    ExperienceArtifactBuilder: "前端界面工程师",
    Frontend: "前端工程师",
    Backend: "后端工程师",
    Builder: "实现工程师",
    Tester: "验证工程师",
    Worker: "执行工程师",
    Coordinator: "协调员",
  };
  return names[role] ?? role;
}

function localizedToolName(tool: string): string {
  const names: Record<string, string> = {
    status: "状态",
    run_command: "执行命令",
    write_file: "写文件",
    append_file: "追加文件",
    read_file: "读文件",
    apply_patch: "修改文件",
    launch_project: "启动项目",
    browser_screenshot: "浏览器截图",
    validate_artifact: "验证产物",
    verify_task: "任务验收",
    search_skills: "查找 skill",
    invoke_skill: "调用 skill",
    mcp_call: "MCP 调用",
    agent_status: "Agent 状态",
  };
  return names[tool] ?? tool;
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
  return randomBytes(32).toString("base64url");
}

function panelTokenTtlMs(): number {
  const raw = Number(process.env.DEEPSEEKCODE_AGENT_PANEL_TOKEN_TTL_MS || 30 * 60 * 1000);
  if (!Number.isFinite(raw)) return 30 * 60 * 1000;
  return Math.min(24 * 60 * 60 * 1000, Math.max(60_000, Math.trunc(raw)));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCommand(command: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const shellCommand = process.platform === "win32" ? "where" : "command";
    const args = process.platform === "win32" ? [command] : ["-v", command];
    const child = execFile(shellCommand, args, { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(undefined);
        return;
      }
      const first = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
      resolve(first);
    });
    child.on("error", () => resolve(undefined));
  });
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

function pixelRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../..", "assets", "pixel-agents");
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function parseClientMessage(raw: string): { type?: string } | undefined {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value as { type?: string } : undefined;
  } catch {
    return undefined;
  }
}

function sendSocket(socket: WebSocket, message: PixelMessage): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const preferred = record.zh ?? record["zh-CN"] ?? record.en;
  if (typeof preferred === "string") return preferred;
  for (const candidate of Object.values(record)) {
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
