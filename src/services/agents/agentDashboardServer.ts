import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { StateStore } from "../../state/sqlite.js";
import { getRunEventBus, type RunEventBusSubscription } from "../runs/runEventBus.js";
import { buildAgentDashboardSnapshot, serializeAgentTraceJsonl } from "./agentDashboardModel.js";
import { dashboardHtml as renderAgentDashboardHtml } from "./agentDashboardPage.js";

export interface AgentDashboardOpenResult {
  localUrl: string;
  shareUrl: string;
  token: string;
  runId: string;
  expiresAtMs: number;
  tracePath?: string;
  remoteAccess: "public-base-url" | "local-only";
}

interface DashboardView {
  runId: string;
  token: string;
  expiresAtMs: number;
}

interface AgentDashboardServerInput {
  state: StateStore;
  projectPath: string;
  dataDir: string;
}

class AgentDashboardServer {
  private server?: Server;
  private port?: number;
  private readonly views = new Map<string, DashboardView>();
  private readonly subscriptions = new Set<RunEventBusSubscription>();

  constructor(private readonly input: AgentDashboardServerInput) {}

  async open(runId: string, options: { openBrowser?: boolean; share?: boolean; writeTrace?: boolean } = {}): Promise<AgentDashboardOpenResult> {
    await this.ensureStarted();
    const token = randomBytes(18).toString("base64url");
    const expiresAtMs = Date.now() + 30 * 60 * 1000;
    this.views.set(token, { runId, token, expiresAtMs });
    const localUrl = this.localDashboardUrl(runId, token);
    const publicBaseUrl = process.env.DEEPSEEKCODE_DASHBOARD_PUBLIC_BASE_URL?.trim();
    const shareUrl = publicBaseUrl
      ? `${publicBaseUrl.replace(/\/$/, "")}/dashboard/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`
      : localUrl;
    if (options.openBrowser) {
      openUrl(localUrl);
    }
    const tracePath = options.writeTrace ? this.writeTrace(runId) : undefined;
    return {
      localUrl,
      shareUrl,
      token,
      runId,
      expiresAtMs,
      tracePath,
      remoteAccess: publicBaseUrl ? "public-base-url" : "local-only",
    };
  }

  close(): void {
    for (const sub of this.subscriptions) sub.unsubscribe();
    this.subscriptions.clear();
    this.server?.close();
    this.server = undefined;
    this.port = undefined;
    this.views.clear();
  }

  writeTrace(runId: string): string {
    const dir = path.join(this.input.dataDir, "agent-dashboard", runId);
    fs.mkdirSync(dir, { recursive: true });
    const tracePath = path.join(dir, "agent-trace.jsonl");
    fs.writeFileSync(tracePath, `${serializeAgentTraceJsonl(this.snapshot(runId))}\n`, "utf8");
    return tracePath;
  }

  private async ensureStarted(): Promise<void> {
    if (this.server && this.port) return;
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    this.port = (this.server.address() as AddressInfo).port;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const base = `http://127.0.0.1:${this.port ?? 0}`;
    const url = new URL(req.url ?? "/", base);
    const token = url.searchParams.get("token") ?? "";
    const view = this.validView(token);
    if (!view) {
      write(res, 403, "text/plain; charset=utf-8", "Dashboard link expired or invalid.");
      return;
    }
    const routeRunId = dashboardRouteRunId(url.pathname, view.runId);
    if (routeRunId !== view.runId) {
      write(res, 403, "text/plain; charset=utf-8", "Dashboard token does not match this run.");
      return;
    }
    if (url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/snapshot")) {
      writeJson(res, this.snapshot(view.runId));
      return;
    }
    if (url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/trace.jsonl")) {
      write(res, 200, "application/x-ndjson; charset=utf-8", `${serializeAgentTraceJsonl(this.snapshot(view.runId))}\n`);
      return;
    }
    if (url.pathname.startsWith("/api/runs/") && url.pathname.endsWith("/events")) {
      this.streamEvents(res, view);
      return;
    }
    if (url.pathname.startsWith("/dashboard/")) {
      write(res, 200, "text/html; charset=utf-8", renderAgentDashboardHtml(view.runId, token));
      return;
    }
    write(res, 404, "text/plain; charset=utf-8", "Not found");
  }

  private streamEvents(res: ServerResponse, view: DashboardView): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(this.snapshot(view.runId))}\n\n`);
    const sub = getRunEventBus().subscribe({ runId: view.runId }, () => {
      if (!this.validView(view.token)) {
        res.end();
        sub.unsubscribe();
        this.subscriptions.delete(sub);
        return;
      }
      res.write(`event: snapshot\ndata: ${JSON.stringify(this.snapshot(view.runId))}\n\n`);
    });
    this.subscriptions.add(sub);
    res.on("close", () => {
      sub.unsubscribe();
      this.subscriptions.delete(sub);
    });
  }

  private snapshot(runId: string) {
    return buildAgentDashboardSnapshot({
      state: this.input.state,
      projectPath: this.input.projectPath,
      runId,
    });
  }

  private validView(token: string): DashboardView | undefined {
    const view = this.views.get(token);
    if (!view) return undefined;
    if (Date.now() > view.expiresAtMs) {
      this.views.delete(token);
      return undefined;
    }
    return view;
  }

  private localDashboardUrl(runId: string, token: string): string {
    return `http://127.0.0.1:${this.port}/dashboard/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  }
}

const servers = new Map<string, AgentDashboardServer>();

export function getAgentDashboardServer(input: AgentDashboardServerInput): AgentDashboardServer {
  const key = path.resolve(input.projectPath).toLowerCase();
  const existing = servers.get(key);
  if (existing) return existing;
  const server = new AgentDashboardServer(input);
  servers.set(key, server);
  return server;
}

export function closeAgentDashboardServer(projectPath: string): boolean {
  const key = path.resolve(projectPath).toLowerCase();
  const server = servers.get(key);
  if (!server) return false;
  server.close();
  servers.delete(key);
  return true;
}

function writeJson(res: ServerResponse, value: unknown): void {
  write(res, 200, "application/json; charset=utf-8", JSON.stringify(value));
}

function write(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function openUrl(url: string): void {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Opening the observer is best-effort; the URL is still returned.
  }
}

function dashboardRouteRunId(pathname: string, fallback: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1] === "runs" && parts[2]) {
    return decodeURIComponent(parts[2]);
  }
  if (parts[0] === "dashboard" && parts[1]) {
    return decodeURIComponent(parts[1]);
  }
  return fallback;
}

function dashboardHtml(runId: string, token: string): string {
  const encodedRunId = JSON.stringify(runId);
  const encodedToken = JSON.stringify(token);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DeepSeekCode Agent Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070908;
      --panel: #111816;
      --panel-2: #0d1110;
      --line: #26342f;
      --text: #f5efe3;
      --muted: #9bafa9;
      --brand: #45e6dd;
      --ok: #47d16c;
      --warn: #f5bf3d;
      --bad: #ff5b6f;
      --ink: #020403;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at top left, #0c302c 0, var(--bg) 36rem), var(--bg); color: var(--text); font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 3; display: flex; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1rem, 4vw, 3rem); border-bottom: 1px solid var(--line); background: rgba(7, 9, 8, 0.9); backdrop-filter: blur(12px); }
    .brand { font-weight: 800; letter-spacing: .02em; color: var(--brand); }
    .muted { color: var(--muted); }
    main { display: grid; gap: 1rem; padding: clamp(1rem, 4vw, 3rem); }
    .overview { display: grid; grid-template-columns: 1.4fr repeat(5, minmax(5rem, .4fr)); gap: .75rem; align-items: stretch; }
    .card, .metric, .column, .timeline, .artifact { border: 1px solid var(--line); background: linear-gradient(180deg, rgba(17, 24, 22, .92), rgba(9, 13, 12, .95)); border-radius: 8px; padding: 1rem; }
    .metric strong { display: block; font-size: 1.45rem; }
    .metric span { color: var(--muted); font-size: .82rem; text-transform: uppercase; letter-spacing: .08em; }
    h1, h2, h3 { margin: 0 0 .7rem; line-height: 1.08; }
    h1 { font-size: clamp(1.6rem, 4vw, 3rem); }
    h2 { font-size: 1.05rem; color: var(--brand); letter-spacing: .04em; text-transform: uppercase; }
    .roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; }
    .role-head { display: flex; justify-content: space-between; gap: 1rem; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: .18rem .55rem; font-size: .78rem; color: var(--muted); white-space: nowrap; }
    .pill.running { color: var(--warn); border-color: rgba(245, 191, 61, .45); }
    .pill.succeeded { color: var(--ok); border-color: rgba(71, 209, 108, .45); }
    .pill.failed { color: var(--bad); border-color: rgba(255, 91, 111, .45); }
    .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; }
    .column h3 { color: var(--muted); font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; }
    ul { padding-left: 1.1rem; margin: .4rem 0 0; }
    li { margin: .25rem 0; }
    .timeline { max-height: 34rem; overflow: auto; }
    .event { display: grid; grid-template-columns: 6rem 1fr; gap: .75rem; padding: .55rem 0; border-bottom: 1px solid rgba(255, 255, 255, .06); }
    .event:last-child { border-bottom: 0; }
    code { background: rgba(69, 230, 221, .12); color: var(--brand); border-radius: 4px; padding: .08rem .28rem; }
    .grid2 { display: grid; grid-template-columns: 1.2fr .8fr; gap: 1rem; }
    .small { font-size: .86rem; color: var(--muted); }
    .bad { color: var(--bad); }
    .ok { color: var(--ok); }
    @media (max-width: 900px) {
      .overview, .grid2 { grid-template-columns: 1fr; }
      .event { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div><span class="brand">DeepSeekCode</span> <span class="muted">multi-agent dashboard</span></div>
    <div class="muted" id="updated">loading</div>
  </header>
  <main>
    <section class="overview" id="overview"></section>
    <section>
      <h2>Agent roles</h2>
      <div class="roles" id="roles"></div>
    </section>
    <section class="grid2">
      <div>
        <h2>Task board</h2>
        <div class="lists" id="taskBoard"></div>
      </div>
      <div>
        <h2>Artifacts and validation</h2>
        <div id="validation"></div>
        <div id="artifacts"></div>
      </div>
    </section>
    <section>
      <h2>Collaboration timeline</h2>
      <div class="timeline" id="timeline"></div>
    </section>
  </main>
  <script>
    const runId = ${encodedRunId};
    const token = ${encodedToken};
    const snapshotUrl = "/api/runs/" + encodeURIComponent(runId) + "/snapshot?token=" + encodeURIComponent(token);
    const eventsUrl = "/api/runs/" + encodeURIComponent(runId) + "/events?token=" + encodeURIComponent(token);
    function esc(value) {
      return String(value ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    }
    function statusClass(value) {
      return String(value || "").replace(/[^a-z_ -]/gi, "").toLowerCase();
    }
    function duration(ms) {
      const seconds = Math.max(0, Math.round((ms || 0) / 1000));
      if (seconds < 60) return seconds + "s";
      const minutes = Math.floor(seconds / 60);
      return minutes + "m " + (seconds % 60) + "s";
    }
    function list(items) {
      if (!items || items.length === 0) return '<p class="small">none yet</p>';
      return "<ul>" + items.slice(0, 8).map(item => "<li>" + esc(item) + "</li>").join("") + "</ul>";
    }
    function render(snapshot) {
      document.getElementById("updated").textContent = "updated " + new Date(snapshot.generatedAtMs).toLocaleTimeString();
      const o = snapshot.overview;
      document.getElementById("overview").innerHTML = [
        '<div class="card"><h1>' + esc(o.objective) + '</h1><p class="muted">phase: ' + esc(o.phase) + ' · status: ' + esc(o.status) + ' · elapsed ' + duration(o.elapsedMs) + '</p>' + (o.staleReason ? '<p class="bad">' + esc(o.staleReason) + '</p>' : '') + '</div>',
        metric("done", o.done + "/" + o.total),
        metric("running", o.running),
        metric("pending", o.pending),
        metric("failed", o.failed),
        metric("cache", o.cacheHitRate == null ? "n/a" : Math.round(o.cacheHitRate * 100) + "%"),
      ].join("");
      document.getElementById("roles").innerHTML = snapshot.roles.map(role => '<article class="card">' +
        '<div class="role-head"><h3>' + esc(role.role) + '</h3><span class="pill ' + statusClass(role.status) + '">' + esc(role.status) + '</span></div>' +
        '<p>' + esc(role.responsibility) + '</p>' +
        '<p><strong>current</strong><br><span class="small">' + esc(role.currentTask || "waiting") + '</span></p>' +
        '<p><strong>last tool</strong> <code>' + esc(role.lastTool || "none") + '</code></p>' +
        (role.blockedBy ? '<p class="bad"><strong>blocked</strong><br>' + esc(role.blockedBy) + '</p>' : '') +
        '<details open><summary>assigned tasks</summary>' + list(role.assignedTasks) + '</details>' +
        '<details><summary>completed evidence</summary>' + list(role.completedTasks) + '</details>' +
        '<details><summary>skills / tools / acceptance</summary>' +
          '<p class="small">skills: ' + esc((role.skills || []).join(", ") || "none") + '</p>' +
          '<p class="small">tools: ' + esc((role.tools || []).join(", ") || "inherit") + '</p>' +
          list(role.acceptance) +
        '</details>' +
        (role.lastMessage ? '<p class="small">latest: ' + esc(role.lastMessage) + '</p>' : '') +
        '</article>').join("");
      document.getElementById("taskBoard").innerHTML = Object.entries(snapshot.taskBoard).map(([key, tasks]) => '<div class="column"><h3>' + esc(key) + '</h3>' + list(tasks.map(t => t.agent + ": " + t.title)) + '</div>').join("");
      document.getElementById("validation").innerHTML = '<div class="artifact"><h3 class="' + statusClass(snapshot.validation.status) + '">' + esc(snapshot.validation.status) + '</h3><p>' + esc(snapshot.validation.summary) + '</p>' + (snapshot.validation.failures.length ? '<p class="bad">failures</p>' + list(snapshot.validation.failures) : '') + '</div>';
      document.getElementById("artifacts").innerHTML = (snapshot.artifacts || []).slice(0, 12).map(a => '<div class="artifact"><strong>' + esc(a.kind) + '</strong><br><code>' + esc(a.path) + '</code></div>').join("") || '<p class="small">No artifacts recorded yet.</p>';
      document.getElementById("timeline").innerHTML = snapshot.timeline.slice(-80).reverse().map(event => '<div class="event"><span class="small">' + new Date(event.createdAtMs).toLocaleTimeString() + '</span><div><strong>' + esc(event.kind) + '</strong> ' + (event.role ? '<span class="pill">' + esc(event.role) + '</span>' : '') + (event.tool ? ' <code>' + esc(event.tool) + '</code>' : '') + '<br><span class="small">' + esc(event.message || event.task || event.artifact || "") + '</span></div></div>').join("");
    }
    function metric(label, value) {
      return '<div class="metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
    }
    async function refresh() {
      const response = await fetch(snapshotUrl);
      if (!response.ok) throw new Error(await response.text());
      render(await response.json());
    }
    refresh().catch(error => document.body.insertAdjacentHTML("beforeend", '<pre class="bad">' + esc(error.message) + '</pre>'));
    const events = new EventSource(eventsUrl);
    events.addEventListener("snapshot", event => render(JSON.parse(event.data)));
    events.onerror = () => setTimeout(refresh, 3000);
  </script>
</body>
</html>`;
}
