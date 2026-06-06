export function dashboardHtml(runId: string, token: string): string {
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
      --bg: #050706;
      --bg-soft: #07100f;
      --panel: rgba(12, 19, 17, 0.92);
      --panel-2: rgba(15, 25, 23, 0.98);
      --line: rgba(115, 255, 235, 0.18);
      --line-strong: rgba(115, 255, 235, 0.34);
      --text: #f7f1e6;
      --muted: #9fb0aa;
      --muted-2: #6f817b;
      --brand: #45e6dd;
      --accent: #ff9f45;
      --ok: #4bdd89;
      --warn: #ffc857;
      --bad: #ff5570;
      --shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 12% 8%, rgba(69, 230, 221, 0.18), transparent 28rem),
        radial-gradient(circle at 90% 0%, rgba(255, 159, 69, 0.12), transparent 30rem),
        var(--bg);
      color: var(--text);
      font: 15px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      overflow: hidden;
    }
    button { font: inherit; }
    .shell { display: grid; grid-template-rows: 64px minmax(0, 1fr); height: 100%; }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 28px;
      border-bottom: 1px solid var(--line);
      background: rgba(5, 7, 6, 0.86);
      backdrop-filter: blur(18px);
    }
    .brand { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
    .logo { color: var(--brand); font-weight: 850; font-size: 18px; letter-spacing: .01em; }
    .sub { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { display: flex; align-items: center; gap: 10px; }
    .pill, .btn {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 11px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.03);
      white-space: nowrap;
    }
    .btn { cursor: pointer; color: var(--text); }
    .btn.active { color: #04100f; background: var(--brand); border-color: var(--brand); font-weight: 800; }
    .layout {
      display: grid;
      grid-template-columns: minmax(280px, 0.95fr) minmax(440px, 1.55fr) minmax(320px, 1fr);
      gap: 14px;
      min-height: 0;
      padding: 18px;
    }
    .stack { display: grid; gap: 14px; min-height: 0; }
    .panel {
      min-height: 0;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(13, 25, 22, .92), rgba(6, 9, 8, .96));
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 15px;
      border-bottom: 1px solid var(--line);
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(26px, 4vw, 54px); line-height: .98; letter-spacing: 0; }
    h2 { color: var(--brand); font-size: 13px; text-transform: uppercase; letter-spacing: .12em; }
    h3 { font-size: 17px; }
    .scroll { overflow: auto; min-height: 0; scrollbar-color: rgba(115,255,235,.35) transparent; }
    .pad { padding: 15px; }
    .objective { min-height: 230px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: rgba(255,255,255,.025);
      min-width: 0;
    }
    .metric .label { color: var(--muted); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
    .metric .value { margin-top: 6px; font-size: 27px; font-weight: 850; }
    .issue {
      border: 1px solid rgba(255, 85, 112, .35);
      background: rgba(255, 85, 112, .08);
      border-radius: 8px;
      padding: 11px;
      color: #ffd4dc;
    }
    .issue-title { color: var(--bad); font-weight: 850; }
    .issue p { margin-top: 6px; color: #f2c4cc; }
    details { margin-top: 9px; color: var(--muted); }
    summary { cursor: pointer; color: var(--text); }
    pre {
      max-height: 240px;
      overflow: auto;
      margin: 8px 0 0;
      padding: 10px;
      border-radius: 7px;
      background: rgba(0,0,0,.38);
      color: #d7e6e2;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
    }
    .roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .role {
      border: 1px solid var(--line);
      border-radius: 9px;
      padding: 13px;
      background: rgba(255,255,255,.025);
      min-width: 0;
    }
    .role-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
    .status { border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; color: var(--muted); font-size: 12px; }
    .status.running { color: var(--warn); border-color: rgba(255,200,87,.36); }
    .status.succeeded { color: var(--ok); border-color: rgba(75,221,137,.36); }
    .status.failed, .status.cancelled { color: var(--bad); border-color: rgba(255,85,112,.36); }
    .field { margin-top: 10px; }
    .field-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .field-value { margin-top: 3px; color: var(--text); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
    .chip { border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px; color: var(--brand); background: rgba(69,230,221,.08); font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
    .board { display: grid; grid-template-columns: repeat(5, minmax(155px, 1fr)); gap: 10px; }
    .lane {
      min-height: 180px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: rgba(255,255,255,.018);
      overflow: hidden;
    }
    .lane h3 { padding: 10px 12px; color: var(--muted); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; border-bottom: 1px solid var(--line); }
    .task { padding: 10px 12px; border-bottom: 1px solid rgba(115,255,235,.09); }
    .task strong { display: block; }
    .task small { color: var(--muted); }
    .timeline-list { display: grid; gap: 8px; }
    .event {
      border: 1px solid rgba(115,255,235,.13);
      border-radius: 8px;
      padding: 10px;
      background: rgba(255,255,255,.022);
    }
    .event-head { display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 12px; }
    .event-message { margin-top: 4px; }
    .arrow { color: var(--accent); font-weight: 800; }
    .artifact { display: grid; gap: 8px; }
    .artifact-row {
      border: 1px solid rgba(115,255,235,.13);
      border-radius: 8px;
      padding: 10px;
      background: rgba(255,255,255,.022);
      word-break: break-word;
    }
    .empty { color: var(--muted-2); padding: 10px 0; }
    @media (max-width: 1260px) {
      body { overflow: auto; }
      .shell { min-height: 100%; height: auto; }
      .layout { grid-template-columns: 1fr; }
      .scroll { max-height: none; }
    }
    @media (max-width: 720px) {
      header { padding: 0 14px; }
      .layout { padding: 12px; }
      .metric-grid, .roles, .board { grid-template-columns: 1fr; }
      h1 { font-size: 34px; }
      .actions .pill { display: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand">
        <div class="logo">DeepSeekCode</div>
        <div class="sub" id="project"></div>
      </div>
      <div class="actions">
        <span class="pill" id="updated"></span>
        <button class="btn active" data-lang="zh">中文</button>
        <button class="btn" data-lang="en">EN</button>
      </div>
    </header>
    <main class="layout">
      <section class="stack">
        <div class="panel objective">
          <div class="pad">
            <h2 id="overviewLabel"></h2>
            <h1 id="objective"></h1>
            <div class="meta" id="meta"></div>
          </div>
          <div class="pad">
            <div class="metric-grid" id="metrics"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2 id="issuesLabel"></h2></div>
          <div class="pad scroll" id="issues" style="max-height: 280px"></div>
        </div>
      </section>
      <section class="stack">
        <div class="panel" style="min-height: 310px">
          <div class="panel-head"><h2 id="rolesLabel"></h2></div>
          <div class="pad scroll" style="max-height: 430px"><div class="roles" id="roles"></div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2 id="boardLabel"></h2></div>
          <div class="pad scroll" style="max-height: 330px"><div class="board" id="board"></div></div>
        </div>
      </section>
      <section class="stack">
        <div class="panel" style="min-height: 360px">
          <div class="panel-head"><h2 id="timelineLabel"></h2><a class="pill" id="traceLink" target="_blank">trace</a></div>
          <div class="pad scroll" id="timeline" style="max-height: 440px"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2 id="artifactLabel"></h2></div>
          <div class="pad scroll" id="artifacts" style="max-height: 330px"></div>
        </div>
      </section>
    </main>
  </div>
  <script>
    const runId = ${encodedRunId};
    const token = ${encodedToken};
    const labels = {
      zh: {
        overview: "总览", roles: "角色工作台", board: "任务板", timeline: "协作时间线",
        artifacts: "产物与验收", issues: "当前问题", updated: "更新",
        phase: "阶段", status: "状态", elapsed: "耗时", lastTool: "最近工具",
        done: "完成", running: "进行中", pending: "待做", failed: "失败", cache: "缓存",
        current: "当前任务", assigned: "已分配", completed: "已完成", skills: "Skills", tools: "工具", acceptance: "验收标准",
        blocked: "阻塞", empty: "暂无", raw: "完整技术细节", validation: "验收", repaired: "已修复", failures: "失败项",
        objectiveFallback: "等待多 Agent 任务目标",
      },
      en: {
        overview: "Overview", roles: "Agent Workbench", board: "Task Board", timeline: "Collaboration Timeline",
        artifacts: "Artifacts and Validation", issues: "Current Issues", updated: "Updated",
        phase: "Phase", status: "Status", elapsed: "Elapsed", lastTool: "Last tool",
        done: "Done", running: "Running", pending: "Pending", failed: "Failed", cache: "Cache",
        current: "Current task", assigned: "Assigned", completed: "Completed", skills: "Skills", tools: "Tools", acceptance: "Acceptance",
        blocked: "Blocked", empty: "None yet", raw: "Full technical details", validation: "Validation", repaired: "Repaired", failures: "Failures",
        objectiveFallback: "Waiting for a multi-agent objective",
      },
    };
    let lang = localStorage.getItem("dscAgentDashboardLang") || "zh";
    let latestSnapshot;

    for (const button of document.querySelectorAll("[data-lang]")) {
      button.addEventListener("click", () => {
        lang = button.dataset.lang;
        localStorage.setItem("dscAgentDashboardLang", lang);
        render(latestSnapshot);
      });
    }

    function t(key) { return labels[lang][key] || labels.zh[key] || key; }
    function local(value) {
      if (!value) return "";
      if (typeof value === "string") return value;
      return value[lang] || value.zh || value.en || "";
    }
    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }
    function compact(value, max = 160) {
      const text = String(value ?? "").replace(/\\s+/g, " ").trim();
      return text.length <= max ? text : text.slice(0, max - 1) + "…";
    }
    function formatMs(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return "0s";
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours) return hours + "h " + (minutes % 60) + "m";
      if (minutes) return minutes + "m " + (seconds % 60) + "s";
      return seconds + "s";
    }
    function metric(label, value) {
      return '<div class="metric"><div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
    }
    function issueBlock(issue, raw) {
      if (!issue && !raw) return "";
      const title = issue ? local(issue.title) : t("blocked");
      const explanation = issue ? local(issue.explanation) : "";
      const suggestion = issue ? local(issue.suggestion) : "";
      const firstLine = issue?.firstLine || "";
      const details = issue?.details || raw || "";
      return '<div class="issue">'
        + '<div class="issue-title">' + escapeHtml(title) + '</div>'
        + (explanation ? '<p>' + escapeHtml(explanation) + '</p>' : '')
        + (suggestion ? '<p>' + escapeHtml(suggestion) + '</p>' : '')
        + (firstLine ? '<p><strong>first:</strong> ' + escapeHtml(compact(firstLine, 220)) + '</p>' : '')
        + (details ? '<details><summary>' + escapeHtml(t("raw")) + '</summary><pre>' + escapeHtml(details) + '</pre></details>' : '')
        + '</div>';
    }
    function list(values, empty = t("empty")) {
      const items = (values || []).filter(Boolean).slice(0, 8);
      if (!items.length) return '<div class="empty">' + escapeHtml(empty) + '</div>';
      return '<ul>' + items.map((item) => '<li>' + escapeHtml(compact(item, 170)) + '</li>').join("") + '</ul>';
    }
    function chips(values) {
      const items = (values || []).filter(Boolean).slice(0, 10);
      if (!items.length) return '<div class="empty">' + escapeHtml(t("empty")) + '</div>';
      return '<div class="chips">' + items.map((item) => '<span class="chip">' + escapeHtml(item) + '</span>').join("") + '</div>';
    }
    function roleCard(role) {
      return '<article class="role">'
        + '<div class="role-top"><h3>' + escapeHtml(role.role) + '</h3><span class="status ' + escapeHtml(role.status || "") + '">' + escapeHtml(role.status || "defined") + '</span></div>'
        + '<p class="muted">' + escapeHtml(compact(role.responsibility, 230)) + '</p>'
        + '<div class="field"><div class="field-label">' + t("current") + '</div><div class="field-value">' + escapeHtml(role.currentTask || "waiting") + '</div></div>'
        + '<div class="field"><div class="field-label">' + t("assigned") + '</div>' + list(role.assignedTasks) + '</div>'
        + '<div class="field"><div class="field-label">' + t("completed") + '</div>' + list(role.completedTasks) + '</div>'
        + '<div class="field"><div class="field-label">' + t("skills") + '</div>' + chips(role.skills) + '</div>'
        + '<div class="field"><div class="field-label">' + t("tools") + '</div>' + chips(role.tools) + '</div>'
        + '<div class="field"><div class="field-label">' + t("acceptance") + '</div>' + list(role.acceptance) + '</div>'
        + (role.lastMessage ? '<div class="field"><div class="field-label">message</div><div class="field-value">' + escapeHtml(compact(role.lastMessage, 180)) + '</div></div>' : '')
        + (role.blockedIssue ? '<div class="field">' + issueBlock(role.blockedIssue) + '</div>' : '')
        + '</article>';
    }
    function taskItem(task) {
      return '<div class="task"><strong>' + escapeHtml(task.agent + ": " + task.title) + '</strong>'
        + '<small>' + escapeHtml(task.status) + '</small>'
        + (task.issue ? issueBlock(task.issue) : (task.detail ? '<p class="muted">' + escapeHtml(compact(task.detail, 180)) + '</p>' : ''))
        + '</div>';
    }
    function eventItem(event) {
      const route = [event.role, event.status].filter(Boolean).join(" · ");
      const title = event.tool || event.kind || "event";
      return '<div class="event">'
        + '<div class="event-head"><span>' + escapeHtml(route || title) + '</span><span>' + new Date(event.createdAtMs || Date.now()).toLocaleTimeString() + '</span></div>'
        + '<div class="event-message"><span class="arrow">' + escapeHtml(title) + '</span> ' + escapeHtml(compact(event.message || event.rawMessage || "", 210)) + '</div>'
        + (event.issue ? issueBlock(event.issue, event.rawMessage) : (event.rawMessage && event.rawMessage !== event.message ? '<details><summary>' + escapeHtml(t("raw")) + '</summary><pre>' + escapeHtml(event.rawMessage) + '</pre></details>' : ''))
        + '</div>';
    }
    function artifactItem(item) {
      return '<div class="artifact-row"><strong>' + escapeHtml(item.kind || "artifact") + '</strong><br>'
        + '<span class="muted">' + escapeHtml(item.path || "") + '</span>'
        + (item.status ? '<br><span>' + escapeHtml(item.status) + '</span>' : '')
        + '</div>';
    }
    function render(snapshot) {
      if (!snapshot) return;
      latestSnapshot = snapshot;
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
      for (const button of document.querySelectorAll("[data-lang]")) button.classList.toggle("active", button.dataset.lang === lang);
      const overview = snapshot.overview || {};
      document.getElementById("project").textContent = snapshot.projectPath || "";
      document.getElementById("updated").textContent = t("updated") + " " + new Date(snapshot.generatedAtMs || Date.now()).toLocaleTimeString();
      document.getElementById("overviewLabel").textContent = t("overview");
      document.getElementById("rolesLabel").textContent = t("roles");
      document.getElementById("boardLabel").textContent = t("board");
      document.getElementById("timelineLabel").textContent = t("timeline");
      document.getElementById("artifactLabel").textContent = t("artifacts");
      document.getElementById("issuesLabel").textContent = t("issues");
      document.getElementById("objective").textContent = overview.objective || t("objectiveFallback");
      document.getElementById("meta").innerHTML = [
        t("phase") + ": " + (overview.phase || "-"),
        t("status") + ": " + (overview.status || "-"),
        t("elapsed") + ": " + formatMs(overview.elapsedMs || 0),
        overview.lastTool ? t("lastTool") + ": " + overview.lastTool : "",
      ].filter(Boolean).map((x) => '<span class="pill">' + escapeHtml(x) + '</span>').join("");
      document.getElementById("metrics").innerHTML = [
        metric(t("done"), (overview.done || 0) + "/" + (overview.total || 0)),
        metric(t("running"), overview.running || 0),
        metric(t("pending"), overview.pending || 0),
        metric(t("failed"), overview.failed || 0),
        metric(t("cache"), Number.isFinite(overview.cacheHitRate) ? Math.round(overview.cacheHitRate * 100) + "%" : "-"),
        metric("USD", Number.isFinite(overview.estimatedCostUsd) ? overview.estimatedCostUsd.toFixed(4) : "-"),
      ].join("");
      const issues = [];
      if (overview.staleIssue) issues.push(issueBlock(overview.staleIssue));
      for (const issue of (snapshot.validation?.failureIssues || []).slice(0, 4)) issues.push(issueBlock(issue));
      for (const role of (snapshot.roles || [])) if (role.blockedIssue) issues.push(issueBlock(role.blockedIssue));
      document.getElementById("issues").innerHTML = issues.length ? issues.join("") : '<div class="empty">' + t("empty") + '</div>';
      document.getElementById("roles").innerHTML = (snapshot.roles || []).map(roleCard).join("") || '<div class="empty">' + t("empty") + '</div>';
      const board = snapshot.taskBoard || {};
      document.getElementById("board").innerHTML = ["queued", "running", "needs_review", "succeeded", "failed"].map((key) =>
        '<section class="lane"><h3>' + escapeHtml(key) + '</h3>' + ((board[key] || []).map(taskItem).join("") || '<div class="task empty">' + t("empty") + '</div>') + '</section>'
      ).join("");
      document.getElementById("timeline").innerHTML = '<div class="timeline-list">' + ((snapshot.timeline || []).slice(-40).reverse().map(eventItem).join("") || '<div class="empty">' + t("empty") + '</div>') + '</div>';
      const validation = snapshot.validation || {};
      const artifactHtml = [
        '<div class="artifact-row"><strong>' + t("validation") + ': ' + escapeHtml(validation.status || "unknown") + '</strong><p class="muted">' + escapeHtml(validation.summary || "") + '</p></div>',
        ...(validation.repaired || []).slice(0, 6).map((item) => '<div class="artifact-row"><strong>' + t("repaired") + '</strong><br>' + escapeHtml(compact(item, 220)) + '</div>'),
        ...(snapshot.artifacts || []).slice(0, 12).map(artifactItem),
      ].join("");
      document.getElementById("artifacts").innerHTML = artifactHtml || '<div class="empty">' + t("empty") + '</div>';
      document.getElementById("traceLink").href = "/api/runs/" + encodeURIComponent(runId) + "/trace.jsonl?token=" + encodeURIComponent(token);
    }
    async function refresh() {
      const response = await fetch("/api/runs/" + encodeURIComponent(runId) + "/snapshot?token=" + encodeURIComponent(token));
      if (response.ok) render(await response.json());
    }
    function connectEvents() {
      const source = new EventSource("/api/runs/" + encodeURIComponent(runId) + "/events?token=" + encodeURIComponent(token));
      source.addEventListener("snapshot", (event) => render(JSON.parse(event.data)));
      source.onerror = () => setTimeout(refresh, 1500);
    }
    refresh().then(connectEvents).catch(() => setTimeout(refresh, 1500));
  </script>
</body>
</html>`;
}
