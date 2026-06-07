import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildAgentDashboardSnapshot,
  serializeAgentTraceJsonl,
  type AgentDashboardRole,
  type AgentDashboardSnapshot,
  type AgentDashboardTimelineEvent,
} from "./agentDashboardModel.js";
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
  private wss?: WebSocketServer;
  private host = process.env.DEEPSEEKCODE_AGENT_PANEL_HOST || "127.0.0.1";
  private port = Number(process.env.DEEPSEEKCODE_AGENT_PANEL_PORT || 0);
  private started = false;
  private tokens = new Map<string, string>();
  private socketTimers = new Set<NodeJS.Timeout>();
  private pixelAssets?: PixelAssets;

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
    for (const timer of this.socketTimers) {
      clearInterval(timer);
    }
    this.socketTimers.clear();
    await new Promise<void>((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      this.wss.close(() => resolve());
    });
    this.wss = undefined;
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
        Location: `/pixel/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.tokenFor(runId))}`,
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

  private pixelBootstrapMessages(runId: string): PixelMessage[] {
    const snapshot = this.snapshot(runId);
    const assets = this.loadPixelAssets();
    const ids = roleIds(snapshot.roles);
    const folderName = path.basename(this.projectPath) || "project";
    const agentMeta: Record<string, { palette: number; hueShift: number; seatId: string | null }> = {};
    const folderNames: Record<string, string> = {};
    for (const id of ids) {
      agentMeta[String(id)] = { palette: id % 8, hueShift: 0, seatId: null };
      folderNames[String(id)] = folderName;
    }

    return [
      {
        type: "providerCapabilities",
        readingTools: ["read_file", "grep_files", "glob_files", "list_files"],
        subagentToolNames: ["Task", "Agent", "start_agent_workflow", "send_agent_message"],
      },
      {
        type: "settingsLoaded",
        soundEnabled: false,
        lastSeenVersion: "deepseekcode-0.3.1",
        extensionVersion: "deepseekcode-0.3.1",
        watchAllSessions: false,
        alwaysShowLabels: true,
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
        layout: assets.layout,
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
    return fs.readFileSync(indexPath, "utf8")
      .replace("<title>webview-ui</title>", "<title>DeepSeekCode Pixel Agents</title>")
      .replace('href="/vite.svg"', 'href="/pixel-assets/banner.png"')
      .split("./assets/")
      .join("/pixel-assets/assets/")
      .replace("</head>", `<script>window.DEEPSEEKCODE_PIXEL_PANEL=${panelConfig};</script></head>`);
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
      agentName: role.role,
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
    type: "agentDiagnostics",
    agents: roles.map((role, index) => ({
      id: ids[index] ?? index + 1,
      role: role.role,
      responsibility: role.responsibility,
      status: role.status,
      currentTask: role.currentTask,
      assignedTasks: role.assignedTasks,
      completedTasks: role.completedTasks,
      blockedBy: role.blockedBy,
      issue: role.blockedIssue,
      lastTool: role.lastTool,
      lastMessage: role.lastMessage,
      skills: role.skills,
      tools: role.tools,
      acceptance: role.acceptance,
    })),
  });
  return messages;
}

function rolesForSnapshot(snapshot: AgentDashboardSnapshot): AgentDashboardRole[] {
  if (snapshot.roles.length) return snapshot.roles;
  const defaultRoles = [
    ["Planner", "Clarify the task, split work, and keep the plan aligned."],
    ["Builder", "Implement the concrete work required by the objective."],
    ["Tester", "Run checks, collect failures, and feed actionable results back."],
    ["Reviewer", "Verify the final result against the task contract."],
  ];
  return defaultRoles.map(([role, responsibility]) => ({
    role,
    responsibility,
    status: "defined",
    assignedTasks: [],
    completedTasks: [],
    skills: [],
    tools: [],
    acceptance: [],
  }));
}

function roleIds(roles: AgentDashboardRole[]): number[] {
  const count = Math.max(roles.length, 4);
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
  items.push({ toolName: "role", status: `职责：${compact(role.responsibility, 80)}`, done: true });
  if (role.currentTask) {
    items.push({ toolName: "task", status: `当前任务：${compact(role.currentTask, 90)}` });
  }
  for (const task of role.assignedTasks.slice(0, 2)) {
    items.push({ toolName: "assigned", status: `已分配：${compact(task, 80)}`, done: role.completedTasks.some((done) => done.includes(task.slice(0, 20))) });
  }
  if (role.lastTool) {
    items.push({ toolName: role.lastTool, status: `最近工具：${compact(role.lastTool, 70)}` });
  }
  if (role.blockedIssue) {
    const issue = role.blockedIssue;
    const title = localizedText(issue.title) || issue.firstLine || role.blockedBy || "需要处理";
    const detail = localizedText(issue.explanation) || localizedText(issue.suggestion);
    items.push({
      toolName: "issue",
      status: `问题：${compact(title, 90)}。${compact(detail, 90)}`,
      permissionActive: /permission|权限|approval|gate/i.test(`${title} ${detail}`),
    });
  } else if (role.blockedBy) {
    items.push({ toolName: "issue", status: `问题：${compact(role.blockedBy, 100)}` });
  }
  if (role.lastMessage) {
    items.push({ toolName: "message", status: `通信：${compact(role.lastMessage, 120)}`, done: true });
  }
  const roleEvents = timeline.filter((event) => event.role === role.role).slice(-2);
  for (const event of roleEvents) {
    const label = event.message ?? event.task ?? event.tool ?? event.kind;
    items.push({ toolName: event.tool ?? event.kind, status: `事件：${compact(label, 120)}`, done: /succeed|done|finished|message/i.test(event.status ?? event.kind) });
  }
  return items.slice(0, 7);
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
