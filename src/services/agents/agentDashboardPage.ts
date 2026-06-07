export function dashboardHtml(runId: string, token: string): string {
  const runIdJson = JSON.stringify(runId);
  const tokenJson = JSON.stringify(token);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DeepSeekCode Agent Panel</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050807;
      --panel: rgba(8, 22, 19, 0.9);
      --panel-2: rgba(4, 10, 9, 0.94);
      --line: rgba(72, 232, 218, 0.22);
      --line-strong: rgba(72, 232, 218, 0.48);
      --text: #f7f2e7;
      --muted: rgba(247, 242, 231, 0.68);
      --subtle: rgba(247, 242, 231, 0.44);
      --cyan: #3de8df;
      --green: #6fe3a0;
      --amber: #ffb55f;
      --red: #ff6680;
      --radius: 8px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at 0 0, rgba(48, 222, 201, 0.18), transparent 28%),
        radial-gradient(circle at 100% 0, rgba(255, 140, 64, 0.14), transparent 26%),
        linear-gradient(180deg, #060a09, #030504 72%);
      overflow: hidden;
    }
    .app { height: 100vh; display: grid; grid-template-rows: 64px 1fr; }
    header {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 0 24px; border-bottom: 1px solid var(--line); background: rgba(3, 5, 4, 0.88);
    }
    .brand { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
    .brand strong { color: var(--cyan); font-size: 22px; }
    .brand span { color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .actions { display: flex; align-items: center; gap: 10px; }
    button, a.button {
      border: 1px solid var(--line); color: var(--muted); background: rgba(255,255,255,0.03);
      border-radius: 999px; padding: 8px 12px; text-decoration: none; cursor: pointer;
    }
    button.active { background: var(--cyan); border-color: var(--cyan); color: #04100f; font-weight: 800; }
    main {
      min-height: 0; padding: 18px; display: grid;
      grid-template-columns: 320px minmax(560px, 1.45fr) minmax(320px, 0.9fr);
      grid-template-rows: 1fr; gap: 16px;
    }
    .column { min-height: 0; display: grid; gap: 16px; }
    .left { grid-template-rows: auto minmax(180px, 1fr); }
    .center { grid-template-rows: minmax(290px, 1fr) minmax(240px, 0.9fr); }
    .right { grid-template-rows: minmax(300px, 1fr) minmax(220px, 0.72fr); }
    .card {
      min-height: 0; border: 1px solid var(--line); border-radius: var(--radius);
      background: linear-gradient(145deg, var(--panel), var(--panel-2)); overflow: hidden;
      box-shadow: 0 18px 54px rgba(0,0,0,0.28);
    }
    .card-head {
      min-height: 50px; padding: 13px 16px; border-bottom: 1px solid var(--line);
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      color: var(--cyan); font-weight: 900; letter-spacing: 0.04em;
    }
    .card-body { height: calc(100% - 50px); overflow: auto; padding: 16px; }
    .overview { padding: 18px; display: grid; gap: 14px; }
    .eyebrow { color: var(--cyan); font-size: 12px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
    h1 {
      margin: 0; font-size: clamp(24px, 2.35vw, 34px); line-height: 1.06; letter-spacing: 0;
      display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
    }
    .meta, .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill, .chip {
      border: 1px solid var(--line); border-radius: 999px; color: var(--muted);
      background: rgba(255,255,255,0.03); padding: 6px 9px;
    }
    .chip { color: var(--cyan); border-radius: 6px; background: rgba(61,232,223,0.11); }
    .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .metric { border: 1px solid var(--line); border-radius: var(--radius); padding: 11px; background: rgba(255,255,255,0.025); }
    .metric label { color: var(--subtle); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric strong { display: block; margin-top: 6px; font-size: 22px; }
    .issue {
      border: 1px solid rgba(255,102,128,0.5); background: rgba(255,102,128,0.08);
      border-radius: var(--radius); padding: 12px; display: grid; gap: 7px; color: #ffd9df;
    }
    .issue strong { color: var(--red); }
    .issue p { margin: 0; color: var(--muted); line-height: 1.45; }
    details summary { cursor: pointer; color: var(--cyan); }
    pre {
      white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto;
      background: rgba(0,0,0,0.26); border-radius: 6px; padding: 10px; color: var(--muted);
    }
    .roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .role {
      border: 1px solid var(--line); border-radius: var(--radius); background: rgba(255,255,255,0.025);
      padding: 13px; display: grid; gap: 10px;
    }
    .role-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .role-top strong { font-size: 18px; }
    .status { border: 1px solid var(--line); color: var(--muted); border-radius: 999px; padding: 4px 8px; }
    .status.running { color: var(--amber); border-color: rgba(255,181,95,0.48); }
    .status.succeeded { color: var(--green); border-color: rgba(111,227,160,0.48); }
    .status.failed, .status.cancelled { color: var(--red); border-color: rgba(255,102,128,0.48); }
    .label { color: var(--subtle); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .text { color: var(--muted); line-height: 1.45; }
    .section { display: grid; gap: 5px; }
    .board { height: 100%; display: grid; grid-template-columns: repeat(5, minmax(168px, 1fr)); gap: 10px; min-width: 940px; }
    .lane { border: 1px solid var(--line); border-radius: var(--radius); padding: 11px; overflow: auto; background: rgba(0,0,0,0.14); }
    .lane h3 { margin: 0 0 10px; color: var(--subtle); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
    .task, .event, .artifact {
      border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius);
      padding: 10px; margin-bottom: 10px; background: rgba(255,255,255,0.025);
    }
    .event-top { display: flex; justify-content: space-between; gap: 8px; color: var(--subtle); font-size: 12px; }
    .event-name { margin-top: 5px; color: var(--amber); font-weight: 900; }
    .empty { color: var(--subtle); }
    @media (max-width: 1180px) {
      body { overflow: auto; }
      .app { height: auto; min-height: 100vh; }
      main { grid-template-columns: 1fr; }
      .left, .center, .right { grid-template-rows: none; }
      .card-body { max-height: 540px; }
      .roles { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="brand"><strong>DeepSeekCode</strong><span id="project">loading</span></div>
      <div class="actions">
        <span class="pill" id="updated">updated --</span>
        <a class="button" id="trace" href="#">trace</a>
        <button id="zh" class="active">中文</button>
        <button id="en">EN</button>
      </div>
    </header>
    <main>
      <section class="column left">
        <div class="card overview" id="overview"></div>
        <div class="card"><div class="card-head" id="issuesTitle"></div><div class="card-body" id="issues"></div></div>
      </section>
      <section class="column center">
        <div class="card"><div class="card-head" id="rolesTitle"></div><div class="card-body"><div class="roles" id="roles"></div></div></div>
        <div class="card"><div class="card-head" id="boardTitle"></div><div class="card-body"><div class="board" id="board"></div></div></div>
      </section>
      <section class="column right">
        <div class="card"><div class="card-head" id="timelineTitle"></div><div class="card-body" id="timeline"></div></div>
        <div class="card"><div class="card-head" id="validationTitle"></div><div class="card-body" id="validation"></div></div>
      </section>
    </main>
  </div>
  <script>
    const RUN_ID = ${runIdJson};
    const TOKEN = ${tokenJson};
    let locale = localStorage.getItem("deepseekcode.agentPanel.locale") || "zh";
    let latest = null;
    const L = {
      zh: {
        overview: "总览", issues: "当前问题", roles: "角色工作台", board: "任务板", timeline: "协作时间线", validation: "产物与验收",
        done: "完成", running: "进行中", pending: "待做", failed: "失败", cache: "缓存", phase: "阶段", status: "状态",
        current: "当前任务", assigned: "已分配", completed: "已完成", blocked: "遇到的问题", lastTool: "最近工具",
        lastMessage: "最近通信", skills: "Skills", tools: "工具", acceptance: "验收标准", explain: "说明", strategy: "处理策略",
        first: "第一行", details: "完整日志", empty: "暂无", objective: "目标", trace: "trace"
      },
      en: {
        overview: "Overview", issues: "Current Issues", roles: "Role Workbench", board: "Task Board", timeline: "Collaboration Timeline", validation: "Artifacts & Validation",
        done: "Done", running: "Running", pending: "Pending", failed: "Failed", cache: "Cache", phase: "Phase", status: "Status",
        current: "Current task", assigned: "Assigned", completed: "Completed", blocked: "Issue", lastTool: "Last tool",
        lastMessage: "Last message", skills: "Skills", tools: "Tools", acceptance: "Acceptance", explain: "Why", strategy: "Strategy",
        first: "First line", details: "Full log", empty: "None yet", objective: "Objective", trace: "trace"
      }
    };
    function t(key) { return L[locale][key] || key; }
    function esc(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
      });
    }
    function statusClass(value) { return "status " + esc(String(value || "defined")); }
    function fmtTime(ms) { return ms ? new Date(ms).toLocaleTimeString() : "--"; }
    function shortText(value, limit) {
      const text = String(value || "").replace(/\\s+/g, " ").trim();
      return text.length > limit ? text.slice(0, limit - 1) + "..." : text;
    }
    function list(items) {
      if (!items || !items.length) return '<div class="empty">' + t("empty") + '</div>';
      return '<ul>' + items.slice(0, 6).map(function(item) { return '<li>' + esc(shortText(item, 150)) + '</li>'; }).join("") + '</ul>';
    }
    function issueHtml(issue) {
      if (!issue) return "";
      const title = issue.title && (issue.title[locale] || issue.title.zh || issue.title.en) || t("blocked");
      const explanation = issue.explanation && (issue.explanation[locale] || issue.explanation.zh || issue.explanation.en) || "";
      const suggestion = issue.strategy && (issue.strategy[locale] || issue.strategy.zh || issue.strategy.en) ||
        issue.suggestion && (issue.suggestion[locale] || issue.suggestion.zh || issue.suggestion.en) || "";
      const details = issue.details && issue.details.length ? issue.details : (issue.firstLine ? [issue.firstLine] : []);
      return '<div class="issue">' +
        '<strong>' + esc(title) + '</strong>' +
        (explanation ? '<p><b>' + t("explain") + ':</b> ' + esc(explanation) + '</p>' : '') +
        (suggestion ? '<p><b>' + t("strategy") + ':</b> ' + esc(suggestion) + '</p>' : '') +
        (issue.firstLine ? '<p><b>' + t("first") + ':</b> ' + esc(shortText(issue.firstLine, 220)) + '</p>' : '') +
        (details.length ? '<details><summary>' + t("details") + '</summary><pre>' + esc(details.join("\\n")) + '</pre></details>' : '') +
      '</div>';
    }
    function render(snapshot) {
      latest = snapshot;
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
      document.getElementById("zh").className = locale === "zh" ? "active" : "";
      document.getElementById("en").className = locale === "en" ? "active" : "";
      document.getElementById("project").textContent = snapshot.projectPath || "";
      document.getElementById("updated").textContent = "updated " + fmtTime(snapshot.generatedAtMs);
      document.getElementById("trace").textContent = t("trace");
      document.getElementById("trace").href = "/api/runs/" + encodeURIComponent(RUN_ID) + "/trace.jsonl?token=" + encodeURIComponent(TOKEN);
      document.getElementById("issuesTitle").textContent = t("issues");
      document.getElementById("rolesTitle").textContent = t("roles");
      document.getElementById("boardTitle").textContent = t("board");
      document.getElementById("timelineTitle").textContent = t("timeline");
      document.getElementById("validationTitle").textContent = t("validation");
      renderOverview(snapshot);
      renderIssues(snapshot);
      renderRoles(snapshot.roles || []);
      renderBoard(snapshot.taskBoard || {});
      renderTimeline(snapshot.timeline || []);
      renderValidation(snapshot);
    }
    function renderOverview(snapshot) {
      const o = snapshot.overview || {};
      document.getElementById("overview").innerHTML =
        '<div class="eyebrow">' + t("overview") + '</div>' +
        '<h1>' + esc(o.objective || t("objective")) + '</h1>' +
        '<div class="meta"><span class="pill">' + t("phase") + ': ' + esc(o.phase || "--") + '</span><span class="pill">' + t("status") + ': ' + esc(o.status || "--") + '</span></div>' +
        (o.staleIssue ? issueHtml(o.staleIssue) : o.staleReason ? '<div class="issue"><strong>' + esc(o.staleReason) + '</strong></div>' : '') +
        '<div class="metric-grid">' +
          metric(t("done"), String(o.done || 0) + "/" + String(o.total || 0)) +
          metric(t("running"), String(o.running || 0)) +
          metric(t("pending"), String(o.pending || 0)) +
          metric(t("failed"), String(o.failed || 0)) +
          metric(t("cache"), o.cacheHitRate == null ? "--" : Math.round(o.cacheHitRate) + "%") +
          metric("Cost", o.estimatedCostUsd == null ? "--" : "$" + Number(o.estimatedCostUsd).toFixed(4)) +
        '</div>';
    }
    function metric(label, value) { return '<div class="metric"><label>' + esc(label) + '</label><strong>' + esc(value) + '</strong></div>'; }
    function renderIssues(snapshot) {
      const issues = [];
      if (snapshot.overview && snapshot.overview.staleIssue) issues.push(snapshot.overview.staleIssue);
      (snapshot.roles || []).forEach(function(role) { if (role.blockedIssue) issues.push(role.blockedIssue); });
      if (snapshot.validation && snapshot.validation.failureIssues) issues.push.apply(issues, snapshot.validation.failureIssues);
      document.getElementById("issues").innerHTML = issues.length
        ? issues.slice(0, 5).map(issueHtml).join("")
        : '<div class="empty">' + t("empty") + '</div>';
    }
    function renderRoles(roles) {
      document.getElementById("roles").innerHTML = roles.length ? roles.map(function(role) {
        return '<article class="role">' +
          '<div class="role-top"><strong>' + esc(role.role) + '</strong><span class="' + statusClass(role.status) + '">' + esc(role.status || "defined") + '</span></div>' +
          '<div class="text">' + esc(role.responsibility || "") + '</div>' +
          section(t("current"), role.currentTask || "waiting") +
          section(t("assigned"), list(role.assignedTasks)) +
          section(t("completed"), list(role.completedTasks)) +
          (role.lastTool ? section(t("lastTool"), '<span class="chip">' + esc(role.lastTool) + '</span>') : '') +
          (role.lastMessage ? section(t("lastMessage"), esc(shortText(role.lastMessage, 180))) : '') +
          (role.skills && role.skills.length ? section(t("skills"), chips(role.skills)) : '') +
          (role.tools && role.tools.length ? section(t("tools"), chips(role.tools)) : '') +
          (role.acceptance && role.acceptance.length ? section(t("acceptance"), list(role.acceptance)) : '') +
          (role.blockedIssue ? issueHtml(role.blockedIssue) : '') +
        '</article>';
      }).join("") : '<div class="empty">' + t("empty") + '</div>';
    }
    function section(label, content) { return '<div class="section"><div class="label">' + esc(label) + '</div><div class="text">' + content + '</div></div>'; }
    function chips(items) { return '<div class="chips">' + items.slice(0, 8).map(function(item) { return '<span class="chip">' + esc(item) + '</span>'; }).join("") + '</div>'; }
    function renderBoard(board) {
      const lanes = ["queued", "running", "needs_review", "succeeded", "failed"];
      document.getElementById("board").innerHTML = lanes.map(function(lane) {
        const tasks = board[lane] || [];
        return '<div class="lane"><h3>' + lane + '</h3>' + (tasks.length ? tasks.map(taskHtml).join("") : '<div class="empty">' + t("empty") + '</div>') + '</div>';
      }).join("");
    }
    function taskHtml(task) {
      return '<div class="task"><b>' + esc(task.agent || "agent") + '</b><div class="text">' + esc(task.title || "") + '</div>' +
        (task.issue ? issueHtml(task.issue) : task.detail ? '<div class="text">' + esc(shortText(task.detail, 160)) + '</div>' : '') + '</div>';
    }
    function renderTimeline(events) {
      const visible = events.slice(-32).reverse();
      document.getElementById("timeline").innerHTML = visible.length ? visible.map(function(event) {
        return '<div class="event"><div class="event-top"><span>' + esc(event.role || event.kind || "event") + '</span><span>' + fmtTime(event.createdAtMs) + '</span></div>' +
          '<div class="event-name">' + esc(event.tool || event.kind || "") + '</div>' +
          (event.message ? '<div class="text">' + esc(shortText(event.message, 180)) + '</div>' : '') +
          (event.issue ? issueHtml(event.issue) : '') +
        '</div>';
      }).join("") : '<div class="empty">' + t("empty") + '</div>';
    }
    function renderValidation(snapshot) {
      const validation = snapshot.validation || {};
      const artifacts = snapshot.artifacts || [];
      document.getElementById("validation").innerHTML =
        '<div class="artifact"><b>' + esc(validation.status || "unknown") + '</b><div class="text">' + esc(validation.summary || "") + '</div></div>' +
        (validation.failureIssues && validation.failureIssues.length ? validation.failureIssues.slice(0, 4).map(issueHtml).join("") : '') +
        (artifacts.length ? artifacts.slice(0, 8).map(function(artifact) {
          return '<div class="artifact"><b>' + esc(artifact.kind || "artifact") + '</b><div class="text">' + esc(artifact.path || "") + '</div>' +
            (artifact.status ? '<span class="pill">' + esc(artifact.status) + '</span>' : '') + '</div>';
        }).join("") : '<div class="empty">' + t("empty") + '</div>');
    }
    async function load() {
      const res = await fetch("/api/runs/" + encodeURIComponent(RUN_ID) + "/snapshot?token=" + encodeURIComponent(TOKEN));
      if (!res.ok) throw new Error(await res.text());
      render(await res.json());
    }
    document.getElementById("zh").onclick = function() { locale = "zh"; localStorage.setItem("deepseekcode.agentPanel.locale", locale); if (latest) render(latest); };
    document.getElementById("en").onclick = function() { locale = "en"; localStorage.setItem("deepseekcode.agentPanel.locale", locale); if (latest) render(latest); };
    load().catch(function(error) {
      document.getElementById("overview").innerHTML = '<div class="issue"><strong>Panel error</strong><p>' + esc(error.message) + '</p></div>';
    });
    try {
      const events = new EventSource("/api/runs/" + encodeURIComponent(RUN_ID) + "/events?token=" + encodeURIComponent(TOKEN));
      events.addEventListener("snapshot", function(event) { render(JSON.parse(event.data)); });
      events.onerror = function() { setTimeout(load, 2000); };
    } catch {
      setInterval(load, 2000);
    }
  </script>
</body>
</html>`;
}
