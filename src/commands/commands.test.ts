import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type { ActionEnvelope, ActionExecutionReport } from "../protocol/actions.js";
import type {
  ChatMessage,
  ChatReply,
  ChatStreamEvent,
  DeepSeekProviderClient,
  TurnClassification,
  UsageSnapshot,
} from "../protocol/provider.js";
import type { CommandContext } from "../types/command.js";
import { SessionStorage } from "../services/session/sessionStorage.js";
import { appendRuntimeLog } from "../services/logging/runtimeLog.js";
import { StateStore } from "../state/sqlite.js";
import { runSlashCommand } from "./index.js";

function makeContext(): CommandContext {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-command-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-command-data-"));
  const config: RuntimeConfig = {
    projectPath,
    dataDir,
    stateDbPath: path.join(dataDir, "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: false,
    browserEnabled: false,
    permissionProfile: "safe",
  };
  const state = new StateStore(config.stateDbPath);
  return {
    config,
    state,
    provider: null,
    permissions: {
      allowShell: false,
      allowBrowser: false,
      profile: "safe",
    },
  };
}

test("approval command creates and decides approval gates", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "test",
  });
  const created = await runSlashCommand("/approval request review generated page", context);
  assert.match(created.message ?? "", /approval_/);
  const gate = context.state.listApprovalGates({ runId })[0];
  assert.equal(gate?.status, "pending");
  const decided = await runSlashCommand(`/approval approve ${gate?.id} looks good`, context);
  assert.match(decided.message ?? "", /approved/);
  assert.equal(context.state.listApprovalGates({ runId })[0]?.status, "approved");
  assert.match((await runSlashCommand("/approval policy", context)).message ?? "", /manualToolApproval=off/);
  assert.match((await runSlashCommand("/approval policy on", context)).message ?? "", /on/);
  assert.match((await runSlashCommand("/approval policy", context)).message ?? "", /manualToolApproval=on/);
  assert.match((await runSlashCommand("/approval policy off", context)).message ?? "", /off/);
  context.state.close();
});

test("help command exposes a React display panel with text fallback", async () => {
  const context = makeContext();
  const result = await runSlashCommand("/help", context);
  assert.ok(result.display);
  assert.match(result.message ?? "", /DeepSeekCode help/);
  assert.match(result.message ?? "", /\/doctor/);
  context.state.close();
});

test("status command summarizes project runtime state", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "status test",
  });
  context.state.createTask({ runId, agent: "Planner", title: "Plan status" });
  context.state.createApprovalGate({
    runId,
    subjectType: "change",
    subjectId: "status",
    summary: "approve status",
  });

  const result = await runSlashCommand("/status", context);
  assert.match(result.message ?? "", /DeepSeekCode status/);
  assert.match(result.message ?? "", /provider: missing/);
  assert.match(result.message ?? "", /permissions: safe/);
  assert.match(result.message ?? "", /runs: recent=1 unfinished=1/);
  assert.match(result.message ?? "", /approvals_pending=1/);
  assert.match(result.message ?? "", /git:/);
  context.state.close();
});

test("settings command exposes a tabbed settings overview", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "settings test",
  });
  context.state.createApprovalGate({
    runId,
    subjectType: "tool_action",
    subjectId: "settings",
    summary: "run_command command=npm.cmd run smoke cwd=.",
  });

  const result = await runSlashCommand("/settings gates", context);
  assert.match(result.message ?? "", /DeepSeekCode settings \(gates\)/);
  assert.match(result.message ?? "", /approvals_pending=1/);
  assert.match(result.message ?? "", /theme:/);
  assert.ok(result.display);

  const theme = await runSlashCommand("/settings theme", context);
  assert.match(theme.message ?? "", /DeepSeekCode settings \(theme\)/);
  assert.match(theme.message ?? "", /theme:/);
  assert.ok(theme.display);
  context.state.close();
});

test("export command writes run, session, and status files", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "export command",
  });
  context.state.createTask({ runId, agent: "Planner", title: "Plan export" });
  new SessionStorage(context.config.dataDir, "session_export").append({ role: "user", text: "hello export" });

  const runResult = await runSlashCommand(`/export run ${runId} exports/run.md`, context);
  assert.match(runResult.message ?? "", /exported run/);
  assert.ok(runResult.display);
  assert.match(fs.readFileSync(path.join(context.config.projectPath, "exports", "run.md"), "utf8"), new RegExp(runId));

  const sessionResult = await runSlashCommand("/export session session_export exports/session.md", context);
  assert.match(sessionResult.message ?? "", /exported session/);
  assert.ok(sessionResult.display);
  assert.match(fs.readFileSync(path.join(context.config.projectPath, "exports", "session.md"), "utf8"), /hello export/);

  const statusResult = await runSlashCommand("/export status exports/status.json", context);
  assert.match(statusResult.message ?? "", /exported status/);
  assert.ok(statusResult.display);
  assert.equal(JSON.parse(fs.readFileSync(path.join(context.config.projectPath, "exports", "status.json"), "utf8")).product, "DeepSeekCode");
  context.state.close();
});

test("version, branch, files, and compact commands expose runtime context", async () => {
  const context = makeContext();
  fs.mkdirSync(path.join(context.config.projectPath, "src"));
  fs.writeFileSync(path.join(context.config.projectPath, "src", "feature.ts"), "export const feature = true;\n", "utf8");
  const session = new SessionStorage(context.config.dataDir, "session_compact");
  for (let index = 0; index < 18; index += 1) {
    session.append({ role: index % 2 === 0 ? "user" : "assistant", text: `message ${index}` });
  }

  assert.match((await runSlashCommand("/version", context)).message ?? "", /deepseekcode/);
  const branch = await runSlashCommand("/branch", context);
  assert.match(branch.message ?? "", /branch:|git branch unavailable/);
  assert.ok(branch.display);
  const project = await runSlashCommand("/project", context);
  assert.match(project.message ?? "", /deepseekcode-command-project/);
  assert.ok(project.display);
  const model = await runSlashCommand("/model", context);
  assert.match(model.message ?? "", /Current model/);
  assert.ok(model.display);
  assert.match((await runSlashCommand("/files feature", context)).message ?? "", /src\/feature\.ts/);
  const compact = await runSlashCommand("/compact session_compact 6", context);
  assert.match(compact.message ?? "", /session: session_compact/);
  assert.match(compact.message ?? "", /message 0/);
  assert.match(compact.message ?? "", /tail=6/);
  context.state.close();
});

test("add-dir command persists extra working directories for context selection", async () => {
  const context = makeContext();
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-extra-workspace-"));
  fs.writeFileSync(path.join(extra, "reference.md"), "extra workspace reference\n", "utf8");

  assert.match((await runSlashCommand("/add-dir", context)).message ?? "", /No extra working directories/);
  assert.match((await runSlashCommand(`/add-dir "${extra}"`, context)).message ?? "", /added working directory/);
  assert.match((await runSlashCommand(`/add-dir ${extra}`, context)).message ?? "", /Already covered/);
  assert.match((await runSlashCommand("/add-dir list", context)).message ?? "", /extra-workspace/);
  assert.match((await runSlashCommand("/context files", context)).message ?? "", /@.*reference\.md/);
  assert.match((await runSlashCommand("/add-dir remove 1", context)).message ?? "", /removed working directory/);
  assert.match((await runSlashCommand("/add-dir clear", context)).message ?? "", /cleared 0/);
  context.state.close();
});

test("rewind command creates, diffs, and restores workspace checkpoints", async () => {
  const context = makeContext();
  fs.writeFileSync(path.join(context.config.projectPath, "note.md"), "before\n", "utf8");

  const created = await runSlashCommand("/rewind create before edits", context);
  assert.match(created.message ?? "", /created checkpoint chk_/);
  assert.ok(created.display);
  const checkpointId = (created.message ?? "").match(/chk_[a-z0-9_]+/)?.[0];
  assert.ok(checkpointId);
  const listed = await runSlashCommand("/checkpoint list", context);
  assert.match(listed.message ?? "", new RegExp(checkpointId));
  assert.ok(listed.display);

  fs.writeFileSync(path.join(context.config.projectPath, "note.md"), "after\n", "utf8");
  fs.writeFileSync(path.join(context.config.projectPath, "new.md"), "new file\n", "utf8");
  const diff = await runSlashCommand(`/rewind diff ${checkpointId}`, context);
  assert.match(diff.message ?? "", /changed=2/);
  assert.match(diff.message ?? "", /new\.md/);
  assert.ok(diff.display);

  const restored = await runSlashCommand(`/rewind restore ${checkpointId}`, context);
  assert.match(restored.message ?? "", /restored=1/);
  assert.ok(restored.display);
  assert.equal(fs.readFileSync(path.join(context.config.projectPath, "note.md"), "utf8"), "before\n");
  assert.equal(fs.existsSync(path.join(context.config.projectPath, "new.md")), true);

  const deletedNew = await runSlashCommand(`/rewind restore ${checkpointId} --delete-new`, context);
  assert.match(deletedNew.message ?? "", /deleted=1/);
  assert.ok(deletedNew.display);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, "new.md")), false);
  const shown = await runSlashCommand(`/rewind show ${checkpointId}`, context);
  assert.match(shown.message ?? "", /note\.md/);
  assert.ok(shown.display);
  context.state.close();
});

test("resume and rename commands manage local session focus", async () => {
  const context = makeContext();
  new SessionStorage(context.config.dataDir, "session_named").append({ role: "user", text: "hello session" });

  const resumed = await runSlashCommand("/resume session_named", context);
  assert.match(resumed.message ?? "", /hello session/);
  assert.ok(resumed.display);
  const current = await runSlashCommand("/resume current", context);
  assert.match(current.message ?? "", /session_named/);
  assert.ok(current.display);
  const renamed = await runSlashCommand('/rename "Useful Session"', context);
  assert.match(renamed.message ?? "", /Useful Session/);
  assert.ok(renamed.display);
  assert.match((await runSlashCommand("/sessions", context)).message ?? "", /\* session_named "Useful Session"/);
  const cleared = await runSlashCommand("/resume clear", context);
  assert.match(cleared.message ?? "", /cleared/);
  assert.ok(cleared.display);
  const noCurrent = await runSlashCommand("/resume current", context);
  assert.match(noCurrent.message ?? "", /No resumed session/);
  assert.ok(noCurrent.display);
  context.state.close();
});

test("tag command toggles searchable session tags", async () => {
  const context = makeContext();
  new SessionStorage(context.config.dataDir, "session_tagged").append({ role: "user", text: "tag me" });
  new SessionStorage(context.config.dataDir, "session_other").append({ role: "assistant", text: "other" });

  const resumed = await runSlashCommand("/resume session_tagged", context);
  assert.match(resumed.message ?? "", /session_tagged/);
  assert.ok(resumed.display);
  const tagged = await runSlashCommand("/tag migration", context);
  assert.match(tagged.message ?? "", /#migration/);
  assert.ok(tagged.display);
  const current = await runSlashCommand("/tag current", context);
  assert.match(current.message ?? "", /#migration/);
  assert.ok(current.display);
  assert.match((await runSlashCommand("/sessions", context)).message ?? "", /#migration/);
  const listed = await runSlashCommand("/tag list migration", context);
  assert.match(listed.message ?? "", /session_tagged/);
  assert.doesNotMatch(listed.message ?? "", /session_other/);
  assert.ok(listed.display);
  const setTag = await runSlashCommand("/tag set session_other review", context);
  assert.match(setTag.message ?? "", /#review/);
  assert.ok(setTag.display);
  assert.match((await runSlashCommand("/tag list review", context)).message ?? "", /session_other/);
  const removed = await runSlashCommand("/tag migration", context);
  assert.match(removed.message ?? "", /removed tag/);
  assert.ok(removed.display);
  const tagsCleared = await runSlashCommand("/tag clear session_other", context);
  assert.match(tagsCleared.message ?? "", /tags cleared/);
  assert.ok(tagsCleared.display);
  context.state.close();
});

test("usage and stats commands summarize persisted usage", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "usage command",
  });
  context.state.recordUsage(runId, {
    inputTokens: 20,
    outputTokens: 5,
    cacheHitTokens: 12,
    cacheMissTokens: 8,
  }, "test");
  context.state.createTask({ runId, agent: "Tester", title: "Check usage", status: "running" });

  assert.match((await runSlashCommand("/usage", context)).message ?? "", /input=20/);
  assert.match((await runSlashCommand(`/usage ${runId}`, context)).message ?? "", /cacheHit=12/);
  assert.match((await runSlashCommand("/cost", context)).message ?? "", /DeepSeekCode cost/);
  assert.match((await runSlashCommand(`/cost ${runId}`, context)).message ?? "", /scope=run_/);
  assert.match((await runSlashCommand("/cost process", context)).message ?? "", /scope=process/);
  const stats = await runSlashCommand("/stats", context);
  assert.match(stats.message ?? "", /DeepSeekCode stats/);
  assert.match(stats.message ?? "", /running=1/);
  assert.match(stats.message ?? "", /cacheRate=/);
  context.state.close();
});

test("effort command controls prompt budgets and output token cap", async () => {
  const context = makeContext();
  context.config.provider = {
    name: "deepseek-test",
    kind: "open_ai_compatible",
    baseUrl: "https://api.deepseek.com",
    apiKey: "test",
    model: "deepseek-v4-flash",
    timeoutSecs: 45,
    maxOutputTokens: 1200,
  };

  const current = await runSlashCommand("/effort", context);
  assert.match(current.message ?? "", /effort=auto/);
  assert.ok(current.display);
  const low = await runSlashCommand("/effort low", context);
  assert.match(low.message ?? "", /effort set to low/);
  assert.match(low.message ?? "", /maxOutput=700/);
  assert.ok(low.display);
  assert.equal(context.config.provider.maxOutputTokens, 700);
  assert.match((await runSlashCommand("/cache plan save DeepSeek tokens", context)).message ?? "", /effort=low/);
  const auto = await runSlashCommand("/effort auto", context);
  assert.match(auto.message ?? "", /effort reset to auto/);
  assert.ok(auto.display);
  assert.equal(context.config.provider.maxOutputTokens, 1200);
  const effortPath = await runSlashCommand("/effort path", context);
  assert.match(effortPath.message ?? "", /inference\.json/);
  assert.ok(effortPath.display);
  context.state.close();
});

test("todos command manages Claude-style local progress lists", async () => {
  const context = makeContext();
  assert.match((await runSlashCommand("/todos", context)).message ?? "", /No todos/);
  assert.match((await runSlashCommand("/todos add Inspect reference :: Inspecting reference", context)).message ?? "", /Inspect reference/);
  assert.match((await runSlashCommand("/todo add Run tests :: Running tests", context)).message ?? "", /Run tests/);
  assert.match((await runSlashCommand("/todos start 1", context)).message ?? "", /\[>\] Inspect reference/);
  assert.match((await runSlashCommand("/todos done 1", context)).message ?? "", /\[x\] Inspect reference/);
  assert.match((await runSlashCommand("/todos done 2", context)).message ?? "", /cleared/);
  assert.match((await runSlashCommand('/todos write-json [{"content":"Build feature","activeForm":"Building feature","status":"in_progress"}]', context)).message ?? "", /Building feature/);
  assert.match((await runSlashCommand("/todos path", context)).message ?? "", /todos\.json/);
  context.state.close();
});

test("plan command manages plan-mode drafts and approvals", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "plan command",
  });
  const started = await runSlashCommand(`/plan start ${runId} Add plan mode`, context);
  assert.match(started.message ?? "", /entered plan mode/);
  assert.ok(started.display);
  const shown = await runSlashCommand(`/plan show ${runId}`, context);
  assert.match(shown.message ?? "", /Goal: Add plan mode/);
  assert.ok(shown.display);
  const exit = await runSlashCommand(`/plan exit ${runId} ## Plan 1. Build service 2. Test`, context);
  assert.match(exit.message ?? "", /plan awaiting approval/);
  assert.ok(exit.display);
  const gate = context.state.listApprovalGates({ subjectType: "plan", subjectId: runId })[0];
  assert.equal(gate?.status, "pending");
  const status = await runSlashCommand(`/plan status ${runId}`, context);
  assert.match(status.message ?? "", /approval_/);
  assert.ok(status.display);
  const approved = await runSlashCommand(`/plan approve ${gate?.id} looks good`, context);
  assert.match(approved.message ?? "", /approved/);
  assert.ok(approved.display);
  assert.match((await runSlashCommand(`/plan path ${runId}`, context)).message ?? "", /plans/);
  context.state.close();
});

test("question command manages model clarification gates", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "question command",
  });
  const asked = await runSlashCommand("/question ask Approach :: Which path should DeepSeekCode use? :: Small=Minimal change :: Full=Full workflow", context);
  assert.match(asked.message ?? "", /Which path/);
  assert.ok(asked.display);
  const gate = context.state.listApprovalGates({ runId, subjectType: "question" })[0];
  assert.equal(gate?.status, "pending");
  const list = await runSlashCommand("/question list pending", context);
  assert.match(list.message ?? "", /Which path/);
  assert.ok(list.display);
  const shown = await runSlashCommand(`/question show ${gate?.id}`, context);
  assert.match(shown.message ?? "", /Full workflow/);
  assert.ok(shown.display);
  const answered = await runSlashCommand(`/question answer ${gate?.id} Full`, context);
  assert.match(answered.message ?? "", /approved/);
  assert.ok(answered.display);
  assert.equal(context.state.listApprovalGates({ runId, subjectType: "question" })[0]?.status, "approved");
  context.state.close();
});

test("btw command asks a cache-planned side question without touching the main tool loop", async () => {
  const context = makeContext();
  const provider = new FakeBtwProvider();
  context.provider = provider;
  fs.mkdirSync(path.join(context.config.projectPath, "src"));
  fs.mkdirSync(path.join(context.config.projectPath, ".deepseekcode", "cache-pins"), { recursive: true });
  fs.writeFileSync(
    path.join(context.config.projectPath, "src", "cache-policy.ts"),
    "export const cachePolicy = 'stable-prefix-first';\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(context.config.projectPath, ".deepseekcode", "cache-pins", "architecture.md"),
    "DeepSeekCode keeps stable prompt blocks before dynamic request context.\n",
    "utf8",
  );

  const result = await runSlashCommand("/btw how should cache be handled?", context);
  assert.match(result.message ?? "", /Side answer from DeepSeek/);
  assert.match(result.message ?? "", /run=run_/);
  assert.match(result.message ?? "", /selectedFiles=/);
  assert.match(result.message ?? "", /stablePrefix=/);
  assert.match(result.message ?? "", /cacheHit=32/);
  assert.match(provider.messages[0]?.content ?? "", /Chinese-first local coding assistant/);
  assert.match(provider.messages[1]?.content ?? "", /<system-reminder>/);
  assert.match(provider.messages[1]?.content ?? "", /cache_pin_architecture/);
  const run = context.state.listRuns(1)[0];
  assert.equal(run?.status, "succeeded");
  assert.match(run?.message ?? "", /side question/);
  const eventKinds = context.state.listEvents(run?.id, 20).map((event) => event.kind);
  assert.equal(eventKinds.includes("cache_prompt_plan"), true);
  assert.equal(eventKinds.includes("side_question_answered"), true);
  assert.equal(context.state.usageTotals(run?.id).snapshots, 1);
  context.state.close();
});

test("init command creates DeepSeekCode project guidance and local extension files", async () => {
  const context = makeContext();
  const result = await runSlashCommand("/init", context);
  assert.match(result.message ?? "", /DeepSeekCode project initialized/);
  assert.ok(result.display);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, "DEEPSEEKCODE.md")), true);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, ".deepseekcode", "agents")), true);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, ".deepseekcode", "output-styles")), true);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, ".deepseekcode", "commands", "verify.md")), true);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, ".deepseekcode", "hooks.json")), true);
  assert.equal(fs.existsSync(path.join(context.config.projectPath, ".deepseekcode", "mcp.json")), true);
  assert.match((await runSlashCommand("/project:verify cache", context)).submit ?? "", /Verify the current DeepSeekCode changes for cache/);
  context.state.close();
});

test("agents command manages local agent definitions", async () => {
  const context = makeContext();
  assert.match((await runSlashCommand("/agents", context)).message ?? "", /No agent definitions/);
  assert.match((await runSlashCommand('/agents create reviewer "review generated diffs"', context)).message ?? "", /created agent project\/reviewer/);
  assert.match((await runSlashCommand("/agents", context)).message ?? "", /reviewer - review generated diffs/);
  assert.match((await runSlashCommand("/agents show reviewer", context)).message ?? "", /tools: read_file, grep_files, list_files/);
  assert.match((await runSlashCommand("/agents suggest fix frontend UI and run tests", context)).message ?? "", /browser_snapshot/);
  assert.match((await runSlashCommand('/agents create-smart ui-helper "fix frontend UI and run tests"', context)).message ?? "", /created smart agent project\/ui-helper/);
  assert.match((await runSlashCommand("/agents start reviewer inspect diffs", context)).message ?? "", /started agent run/);
  assert.match((await runSlashCommand("/agents runs", context)).message ?? "", /agent:reviewer inspect diffs/);
  assert.match((await runSlashCommand("/agents detail", context)).message ?? "", /tasks:/);
  assert.match((await runSlashCommand("/agents add current reviewer inspect tests", context)).message ?? "", /added agent task/);
  assert.match((await runSlashCommand("/agents step", context)).message ?? "", /Provider missing/);
  assert.match((await runSlashCommand("/agents drain", context)).message ?? "", /Provider missing/);
  assert.match((await runSlashCommand("/agents daemon", context)).message ?? "", /Provider missing/);
  assert.match((await runSlashCommand("/agents run reviewer inspect diffs", context)).message ?? "", /Provider missing/);
  assert.match((await runSlashCommand("/agents validate reviewer", context)).message ?? "", /ok reviewer/);
  assert.match((await runSlashCommand("/agents path reviewer", context)).message ?? "", /reviewer\.md/);
  context.state.close();
});

test("output-style command manages project response styles", async () => {
  const context = makeContext();
  assert.match((await runSlashCommand("/output-style", context)).message ?? "", /\* builtin\/deepseek/);
  assert.match((await runSlashCommand('/output-style create brief "brief project replies"', context)).message ?? "", /created output style project\/brief/);
  assert.match((await runSlashCommand("/output-style validate brief", context)).message ?? "", /ok brief/);
  assert.match((await runSlashCommand("/output-style show brief", context)).message ?? "", /brief project replies/);
  assert.match((await runSlashCommand("/output-style set brief", context)).message ?? "", /output style: brief/);
  assert.match((await runSlashCommand("/config", context)).message ?? "", /"outputStyle"/);
  assert.match((await runSlashCommand("/config", context)).message ?? "", /"name": "brief"/);
  context.state.close();
});

test("mcp command manages local MCP server config", async () => {
  const context = makeContext();
  const serverPath = path.join(context.config.projectPath, "fake-mcp.js");
  fs.writeFileSync(serverPath, fakeMcpServerSource(), "utf8");
  assert.match((await runSlashCommand("/mcp", context)).message ?? "", /No MCP servers/);
  assert.match((await runSlashCommand("/mcp add-stdio fs node server.js", context)).message ?? "", /added MCP stdio server fs/);
  assert.match((await runSlashCommand("/mcp", context)).message ?? "", /enabled fs stdio node server\.js/);
  assert.match((await runSlashCommand("/mcp validate fs", context)).message ?? "", /ok fs/);
  assert.match((await runSlashCommand("/mcp disable fs", context)).message ?? "", /disabled/);
  assert.match((await runSlashCommand("/mcp show fs", context)).message ?? "", /"type": "stdio"/);
  assert.match((await runSlashCommand("/mcp remove fs", context)).message ?? "", /removed MCP server fs/);
  assert.match((await runSlashCommand(`/mcp add-stdio fake node "${serverPath}"`, context)).message ?? "", /added MCP stdio server fake/);
  assert.match((await runSlashCommand("/mcp health fake", context)).message ?? "", /failed fake stdio/);
  assert.match((await runSlashCommand("/mcp tools fake", context)).message ?? "", /requires shell permission/);
  assert.match((await runSlashCommand("/shell on", context)).message ?? "", /shell: on/);
  assert.match((await runSlashCommand("/mcp health fake", context)).message ?? "", /ok fake stdio/);
  assert.match((await runSlashCommand("/mcp tools fake", context)).message ?? "", /- echo/);
  assert.match((await runSlashCommand("/mcp connect fake", context)).message ?? "", /connected MCP server fake/);
  assert.match((await runSlashCommand("/mcp sessions", context)).message ?? "", /fake stdio tools=1/);
  assert.match((await runSlashCommand('/mcp call fake echo {"text":"from-command"}', context)).message ?? "", /from-command/);
  assert.match((await runSlashCommand("/mcp close fake", context)).message ?? "", /closed 1 MCP session/);
  context.state.close();
});

test("tasks, sessions, cmd, and browser commands expose safe local controls", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "test",
  });
  context.state.createTask({ runId, agent: "Builder", title: "Build page" });
  assert.match((await runSlashCommand("/tasks", context)).message ?? "", /Builder/);

  new SessionStorage(context.config.dataDir, "session_test").append({ role: "user", text: "hello" });
  assert.match((await runSlashCommand("/sessions", context)).message ?? "", /session_test/);

  const tools = await runSlashCommand("/tools", context);
  assert.match(tools.message ?? "", /read_file/);
  assert.ok(tools.display);
  const toolDetail = await runSlashCommand("/tools show run_command", context);
  assert.match(toolDetail.message ?? "", /Bash/);
  assert.ok(toolDetail.display);
  const blockedCmd = await runSlashCommand("/cmd node --version", context);
  assert.match(blockedCmd.message ?? "", /Shell is off/);
  assert.ok(blockedCmd.display);
  assert.match((await runSlashCommand("/ssh", context)).message ?? "", /No SSH profiles/);
  assert.match((await runSlashCommand('/ssh add prod example.com deploy 2222 "/srv/app"', context)).message ?? "", /ssh profile prod saved/);
  assert.match((await runSlashCommand("/ssh preview prod", context)).message ?? "", /ssh -p 2222 deploy@example\.com/);
  const sshSession = await runSlashCommand("/ssh connect prod", context);
  assert.match(sshSession.message ?? "", /ssh_/);
  assert.match((await runSlashCommand("/ssh sessions", context)).message ?? "", /prod deploy@example\.com/);
  assert.match((await runSlashCommand("/ssh run prod echo remote-ok", context)).message ?? "", /SSH execution is disabled/);
  const fakeSsh = path.join(context.config.projectPath, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, fakeSshSource(), "utf8");
  const previousSshBin = process.env.DEEPSEEKCODE_SSH_BIN;
  const previousSshBinArgs = process.env.DEEPSEEKCODE_SSH_BIN_ARGS;
  process.env.DEEPSEEKCODE_SSH_BIN = process.execPath;
  process.env.DEEPSEEKCODE_SSH_BIN_ARGS = JSON.stringify([fakeSsh]);
  const shellOn = await runSlashCommand("/shell on", context);
  assert.match(shellOn.message ?? "", /shell: on/);
  assert.ok(shellOn.display);
  const localCmd = await runSlashCommand('/cmd node -e "console.log(42)"', context);
  assert.match(localCmd.message ?? "", /42/);
  assert.ok(localCmd.display);
  assert.match((await runSlashCommand("/ssh health prod", context)).message ?? "", /ok prod deploy@example\.com/);
  assert.match((await runSlashCommand("/ssh run prod echo remote-ok", context)).message ?? "", /ssh_cmd_.*remote-ok/s);
  assert.match((await runSlashCommand("/ssh history", context)).message ?? "", /prod deploy@example\.com echo remote-ok/);
  context.state.createTask({
    runId,
    agent: "ssh:prod",
    title: "Remote queue",
    detail: "echo queue-ok",
  });
  assert.match((await runSlashCommand(`/ssh worker prod ${runId} 2`, context)).message ?? "", /ssh worker prod .*completed/s);
  assert.match((await runSlashCommand("/ssh history", context)).message ?? "", /queue-ok/);
  assert.match((await runSlashCommand("/ssh cat prod remote.txt 80", context)).message ?? "", /remote-file:remote\.txt/);
  assert.match((await runSlashCommand("/ssh pull prod remote.txt pulled/remote.txt --overwrite", context)).message ?? "", /pulled .*pulled\/remote\.txt/);
  assert.equal(fs.readFileSync(path.join(context.config.projectPath, "pulled", "remote.txt"), "utf8"), "remote-file:remote.txt\n");
  fs.writeFileSync(path.join(context.config.projectPath, "sync-local.txt"), "local sync\n", "utf8");
  assert.match((await runSlashCommand("/ssh push prod sync-local.txt uploads/sync.txt --overwrite", context)).message ?? "", /pushed 11 bytes/);
  if (previousSshBin === undefined) delete process.env.DEEPSEEKCODE_SSH_BIN;
  else process.env.DEEPSEEKCODE_SSH_BIN = previousSshBin;
  if (previousSshBinArgs === undefined) delete process.env.DEEPSEEKCODE_SSH_BIN_ARGS;
  else process.env.DEEPSEEKCODE_SSH_BIN_ARGS = previousSshBinArgs;
  assert.match((await runSlashCommand("/browser open https://example.com", context)).message ?? "", /Browser is off/);
  assert.match((await runSlashCommand("/browser sessions", context)).message ?? "", /No browser sessions/);
  assert.match((await runSlashCommand("/browser snapshot https://example.com", context)).message ?? "", /Browser is off/);
  assert.match((await runSlashCommand("/browser on", context)).message ?? "", /browser: on/);
  assert.match((await runSlashCommand("/browser trajectory", context)).message ?? "", /No browser trajectory records/);
  const previousCdp = process.env.DEEPSEEKCODE_BROWSER_CDP_URL;
  delete process.env.DEEPSEEKCODE_BROWSER_CDP_URL;
  assert.match((await runSlashCommand("/browser snapshot https://example.com", context)).message ?? "", /DEEPSEEKCODE_BROWSER_CDP_URL/);
  assert.match((await runSlashCommand("/browser trajectory", context)).message ?? "", /failed command snapshot https:\/\/example\.com/);
  if (previousCdp === undefined) delete process.env.DEEPSEEKCODE_BROWSER_CDP_URL;
  else process.env.DEEPSEEKCODE_BROWSER_CDP_URL = previousCdp;
  assert.match((await runSlashCommand("/memory", context)).message ?? "", /Project memory is empty/);
  assert.match((await runSlashCommand("/memory add prefer TypeScript runtime", context)).message ?? "", /Project memory appended/);
  assert.match((await runSlashCommand("/memory", context)).message ?? "", /prefer TypeScript runtime/);
  appendRuntimeLog(context.config.dataDir, { level: "info", message: "hello log", createdAtMs: Date.now() });
  const logs = await runSlashCommand("/logs", context);
  assert.match(logs.message ?? "", /hello log/);
  assert.ok(logs.display);
  context.state.close();
});

test("hooks command manages local hook definitions and gated execution", async () => {
  const context = makeContext();
  assert.match((await runSlashCommand("/hooks", context)).message ?? "", /No hooks configured/);
  assert.match((await runSlashCommand("/hooks add pre-read PreToolUse read_file node -p 42", context)).message ?? "", /added hook pre-read/);
  assert.match((await runSlashCommand("/hooks", context)).message ?? "", /pre-read PreToolUse read_file/);
  assert.match((await runSlashCommand("/hooks validate", context)).message ?? "", /ok/);
  assert.match((await runSlashCommand('/hooks run PreToolUse {"tool_name":"read_file"}', context)).message ?? "", /skipped pre-read/);
  assert.match((await runSlashCommand("/shell on", context)).message ?? "", /shell: on/);
  assert.match((await runSlashCommand('/hooks run PreToolUse {"tool_name":"read_file"}', context)).message ?? "", /stdout: 42/);
  assert.match((await runSlashCommand("/hooks remove pre-read", context)).message ?? "", /removed hook pre-read/);
  context.state.close();
});

test("permissions command switches profiles and Claude-compatible modes", async () => {
  const context = makeContext();

  assert.match((await runSlashCommand("/permissions", context)).message ?? "", /profile: safe/);
  assert.match((await runSlashCommand("/permissions profiles", context)).message ?? "", /open: shell=on browser=on/);
  assert.match((await runSlashCommand("/permissions profile dev", context)).message ?? "", /permissions profile: dev/);
  assert.equal(context.permissions.allowShell, true);
  assert.equal(context.permissions.allowBrowser, false);
  assert.match((await runSlashCommand("/permissions mode bypassPermissions", context)).message ?? "", /permissions profile: open/);
  assert.equal(context.permissions.allowShell, true);
  assert.equal(context.permissions.allowBrowser, true);
  assert.match((await runSlashCommand("/permissions browser off", context)).message ?? "", /profile: custom/);
  assert.equal(context.permissions.allowShell, true);
  assert.equal(context.permissions.allowBrowser, false);
  assert.match((await runSlashCommand("/permissions reset", context)).message ?? "", /profile: safe/);
  assert.equal(context.permissions.allowShell, false);
  assert.equal(context.permissions.allowBrowser, false);

  context.state.close();
});

test("theme command manages terminal theme settings", async () => {
  const context = makeContext();
  const previous = process.env.DEEPSEEKCODE_THEME;
  delete process.env.DEEPSEEKCODE_THEME;

  const current = await runSlashCommand("/theme current", context);
  assert.match(current.message ?? "", /deepseek-dark/);
  assert.ok(current.display);
  const listed = await runSlashCommand("/theme list", context);
  assert.match(listed.message ?? "", /cache-green/);
  assert.ok(listed.display);
  const set = await runSlashCommand("/theme set cache-green", context);
  assert.match(set.message ?? "", /cache-green/);
  assert.ok(set.display);
  assert.equal(process.env.DEEPSEEKCODE_THEME, "cache-green");
  const themePath = await runSlashCommand("/theme path", context);
  assert.match(themePath.message ?? "", /theme\.json/);
  assert.ok(themePath.display);
  const reset = await runSlashCommand("/theme reset", context);
  assert.match(reset.message ?? "", /deepseek-dark/);
  assert.ok(reset.display);

  if (previous === undefined) delete process.env.DEEPSEEKCODE_THEME;
  else process.env.DEEPSEEKCODE_THEME = previous;
  context.state.close();
});

test("cache command can explain the Resonix prompt plan for a goal", async () => {
  const context = makeContext();
  fs.mkdirSync(path.join(context.config.projectPath, "src"));
  fs.mkdirSync(path.join(context.config.projectPath, "docs"));
  fs.writeFileSync(path.join(context.config.projectPath, "src", "cache-hit.ts"), "export const cacheHit = true;\n", "utf8");
  fs.writeFileSync(path.join(context.config.projectPath, "README.md"), "# DeepSeekCode\nStable cache architecture facts.\n", "utf8");
  fs.writeFileSync(path.join(context.config.projectPath, "docs", "cache.md"), "DeepSeek cache pins should hold stable project facts.\n", "utf8");
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "cache command",
  });
  context.state.recordUsage(runId, {
    inputTokens: 40,
    outputTokens: 10,
    cacheHitTokens: 8,
    cacheMissTokens: 32,
  }, "test");
  context.state.appendEvent(runId, "stable_prompt_prepared", { prefix_stable: false });
  context.state.appendEvent(runId, "cache_prompt_plan", { approx_tokens: 7000, dropped_chars: 100 });

  assert.match((await runSlashCommand("/cache pin", context)).message ?? "", /No cache pins/);
  const suggestedPins = await runSlashCommand("/cache pin suggest cache architecture", context);
  assert.match(suggestedPins.message ?? "", /README\.md/);
  assert.match(suggestedPins.message ?? "", /command=\/cache pin add/);
  assert.ok(suggestedPins.display);
  const fromReadme = await runSlashCommand("/cache pin from README.md readme", context);
  assert.match(fromReadme.message ?? "", /cache pin readme saved from README\.md/);
  assert.match((await runSlashCommand("/cache pin show readme", context)).message ?? "", /Source: README\.md/);
  assert.match((await runSlashCommand("/cache pin from ../secret.md", context)).message ?? "", /traversal|escapes|absolute/);
  assert.match((await runSlashCommand("/cache pin add architecture stable DeepSeekCode TypeScript facts", context)).message ?? "", /cache pin architecture saved/);
  const pinAudit = await runSlashCommand("/cache pin audit", context);
  assert.match(pinAudit.message ?? "", /cache pin audit:/);
  assert.match(pinAudit.message ?? "", /pins=2/);
  assert.ok(pinAudit.display);
  const appliedPins = await runSlashCommand("/cache pin apply cache architecture", context);
  assert.match(appliedPins.message ?? "", /cache pin apply:/);
  assert.match(appliedPins.message ?? "", /created=\d+/);
  assert.match(appliedPins.message ?? "", /Next: run \/cache pin audit/);
  assert.ok(appliedPins.display);
  assert.match((await runSlashCommand("/cache pin show architecture", context)).message ?? "", /stable DeepSeekCode TypeScript facts/);
  const result = await runSlashCommand("/cache plan improve cache-hit behavior", context);
  assert.match(result.message ?? "", /dynamicTokens~/);
  assert.match(result.message ?? "", /shapeSeen=repeat=first/);
  assert.match(result.message ?? "", /sticky:cache_pin_architecture/);
  assert.match(result.message ?? "", /current_user_request/);
  assert.match(result.message ?? "", /selected_context/);
  const repeatPlan = await runSlashCommand("/cache plan improve cache-hit behavior", context);
  assert.match(repeatPlan.message ?? "", /shapeSeen=repeat=2/);
  const shapes = await runSlashCommand("/cache shapes", context);
  assert.match(shapes.message ?? "", /count=2/);
  assert.match(shapes.message ?? "", /truncated=/);
  assert.ok(shapes.display);
  assert.match((await runSlashCommand("/cache shapes path", context)).message ?? "", /cache-shapes\.json/);
  const doctor = await runSlashCommand(`/cache doctor ${runId}`, context);
  assert.match(doctor.message ?? "", /DeepSeek cache doctor/);
  assert.match(doctor.message ?? "", /prefixDrift=1/);
  assert.match(doctor.message ?? "", /low-cache runs:/);
  assert.ok(doctor.display);
  const readiness = await runSlashCommand("/cache", context);
    assert.match(readiness.message ?? "", /DeepSeek cache readiness:/);
    assert.match(readiness.message ?? "", /pins count=/);
    assert.match(readiness.message ?? "", /shapes count=/);
    assert.ok(readiness.display);
    const preflight = await runSlashCommand("/cache preflight improve cache-hit behavior", context);
    assert.match(preflight.message ?? "", /DeepSeek cache preflight:/);
    assert.match(preflight.message ?? "", /goal=improve cache-hit behavior/);
    assert.match(preflight.message ?? "", /shape=/);
    assert.match(preflight.message ?? "", /next commands:/);
    assert.ok(preflight.display);
    const guardPolicy = await runSlashCommand("/cache guard policy", context);
    assert.match(guardPolicy.message ?? "", /DeepSeek cache guard policy/);
    assert.match(guardPolicy.message ?? "", /strict=off/);
    const guardMinHit = await runSlashCommand("/cache guard min-hit 50%", context);
    assert.match(guardMinHit.message ?? "", /minHit=50%/);
    const guardStrict = await runSlashCommand("/cache guard strict on", context);
    assert.match(guardStrict.message ?? "", /strict=on/);
    const guard = await runSlashCommand("/cache guard improve cache-hit behavior", context);
    assert.match(guard.message ?? "", /DeepSeek cache guard:/);
    assert.match(guard.message ?? "", /estimatedHit=\d+%/);
    assert.match(guard.message ?? "", /DeepSeek cache guard policy/);
    assert.match(guard.message ?? "", /next commands:/);
    assert.ok(guard.display);
    assert.match((await runSlashCommand("/cache guard reset", context)).message ?? "", /source=default/);
    const prepared = await runSlashCommand("/cache prepare improve cache-hit behavior", context);
    assert.match(prepared.message ?? "", /DeepSeek cache prepare/);
    assert.match(prepared.message ?? "", /cache pin apply:/);
    assert.match(prepared.message ?? "", /DeepSeek cache preflight:/);
    assert.ok(prepared.display);
    const profileSaved = await runSlashCommand("/cache profile save frontend improve cache-hit behavior", context);
    assert.match(profileSaved.message ?? "", /cache profile frontend saved/);
    assert.match(profileSaved.message ?? "", /shape=/);
    assert.ok(profileSaved.display);
    const profiles = await runSlashCommand("/cache profile list", context);
    assert.match(profiles.message ?? "", /frontend/);
    assert.ok(profiles.display);
    const profileAudit = await runSlashCommand("/cache profile audit", context);
    assert.match(profileAudit.message ?? "", /cache profile audit:/);
    assert.match(profileAudit.message ?? "", /profiles=/);
    assert.ok(profileAudit.display);
    const profileClean = await runSlashCommand("/cache profile clean", context);
    assert.match(profileClean.message ?? "", /cache profile clean:/);
    assert.match(profileClean.message ?? "", /mode=preview/);
    assert.ok(profileClean.display);
    const profileMatch = await runSlashCommand("/cache profile match cache-hit frontend behavior", context);
    assert.match(profileMatch.message ?? "", /cache profile matches/);
    assert.match(profileMatch.message ?? "", /frontend/);
    assert.match(profileMatch.message ?? "", /command=\/cache profile prepare frontend/);
    assert.ok(profileMatch.display);
    const profileForecast = await runSlashCommand("/cache profile forecast cache-hit frontend behavior", context);
    assert.match(profileForecast.message ?? "", /cache profile forecast:/);
    assert.match(profileForecast.message ?? "", /profile=frontend/);
    assert.match(profileForecast.message ?? "", /estimatedHit=\d+%/);
    assert.ok(profileForecast.display);
    const profileAuto = await runSlashCommand("/cache profile auto cache-hit frontend behavior", context);
    assert.match(profileAuto.message ?? "", /DeepSeek cache profile auto/);
    assert.match(profileAuto.message ?? "", /matched profile=frontend/);
    assert.match(profileAuto.message ?? "", /DeepSeek cache preflight:/);
    assert.ok(profileAuto.display);
    const profileShow = await runSlashCommand("/cache profile show frontend", context);
    assert.match(profileShow.message ?? "", /cache profile frontend/);
    assert.match(profileShow.message ?? "", /pins=/);
    assert.ok(profileShow.display);
    const profilePrepared = await runSlashCommand("/cache profile prepare frontend", context);
    assert.match(profilePrepared.message ?? "", /DeepSeek cache profile prepare/);
    assert.match(profilePrepared.message ?? "", /DeepSeek cache preflight:/);
    assert.ok(profilePrepared.display);
    context.state.close();
  });

test("diff command compares two project files", async () => {
  const context = makeContext();
  fs.writeFileSync(path.join(context.config.projectPath, "before.txt"), "one\ntwo\nthree\n", "utf8");
  fs.writeFileSync(path.join(context.config.projectPath, "after.txt"), "one\n2\nthree\nfour\n", "utf8");

  const result = await runSlashCommand("/diff file before.txt after.txt", context);
  assert.match(result.message ?? "", /file diff before\.txt -> after\.txt \+2 -1/);
  assert.match(result.message ?? "", /\+2/);
  assert.match(result.message ?? "", /-two/);
  assert.ok(result.display);
  assert.match((await runSlashCommand("/diff file ../before.txt after.txt", context)).message ?? "", /traversal|escapes|absolute/);
  context.state.close();
});

test("review commands prepare DeepSeek review prompts from file diffs", async () => {
  const context = makeContext();
  fs.writeFileSync(path.join(context.config.projectPath, "before.ts"), "export const value = 1;\n", "utf8");
  fs.writeFileSync(path.join(context.config.projectPath, "after.ts"), "export const value = 2;\n", "utf8");

  const review = await runSlashCommand("/review file before.ts after.ts", context);
  assert.match(review.message ?? "", /Review prompt prepared/);
  assert.match(review.submit ?? "", /expert code reviewer/);
  assert.match(review.submit ?? "", /```diff/);
  assert.match(review.submit ?? "", /-export const value = 1/);

  const security = await runSlashCommand("/security-review file before.ts after.ts", context);
  assert.match(security.message ?? "", /Security review prompt prepared/);
  assert.match(security.submit ?? "", /senior security reviewer/);
  assert.match(security.submit ?? "", /high-confidence vulnerabilities/);
  context.state.close();
});

test("queue and run-control commands expose durable task state", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "test",
  });
  const plannerId = context.state.createTask({ runId, agent: "Planner", title: "Plan" });
  const builderId = context.state.createTask({ runId, agent: "Builder", title: "Build" });
  context.state.addTaskDependency(builderId, plannerId);

  const queue = await runSlashCommand(`/queue ${runId}`, context);
  assert.match(queue.message ?? "", /runnable Planner/);
  assert.match(queue.message ?? "", /queued Builder/);

  const paused = await runSlashCommand(`/pause ${runId} wait`, context);
  assert.match(paused.message ?? "", /paused/);
  assert.ok(paused.display);
  assert.equal(context.state.getRun(runId)?.status, "paused");
  const resumed = await runSlashCommand(`/run-resume ${runId} go`, context);
  assert.match(resumed.message ?? "", /resumed/);
  assert.ok(resumed.display);
  assert.equal(context.state.getRun(runId)?.status, "running");
  const cancelled = await runSlashCommand(`/cancel ${runId} stop`, context);
  assert.match(cancelled.message ?? "", /cancelled/);
  assert.ok(cancelled.display);
  assert.equal(context.state.getRun(runId)?.status, "cancelled");
  context.state.close();
});

test("attach command persists TUI focus for unfinished runs", async () => {
  const context = makeContext();
  const running = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "running task",
  });
  const done = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "done task",
  });
  context.state.updateRunStatus(done, "succeeded", "done");

  const attachList = await runSlashCommand("/attach list", context);
  assert.match(attachList.message ?? "", new RegExp(running));
  assert.doesNotMatch(attachList.message ?? "", new RegExp(done));
  assert.ok(attachList.display);
  const attachLatest = await runSlashCommand("/attach latest", context);
  assert.match(attachLatest.message ?? "", /attached/);
  assert.ok(attachLatest.display);
  const attachCurrent = await runSlashCommand("/attach current", context);
  assert.match(attachCurrent.message ?? "", new RegExp(running));
  assert.ok(attachCurrent.display);
  context.state.createTask({ runId: running, agent: "Planner", title: "Attached plan" });
  assert.match((await runSlashCommand("/tasks attached", context)).message ?? "", /Attached plan/);
  assert.match((await runSlashCommand("/queue attached", context)).message ?? "", /Attached plan/);
  const events = await runSlashCommand("/events attached", context);
  assert.match(events.message ?? "", /run_attached|task_created/);
  assert.ok(events.display);
  const trace = await runSlashCommand("/trace attached", context);
  assert.match(trace.message ?? "", /Attached plan/);
  assert.ok(trace.display);
  const cleared = await runSlashCommand("/attach clear", context);
  assert.match(cleared.message ?? "", /cleared/);
  assert.ok(cleared.display);
  const noCurrent = await runSlashCommand("/attach current", context);
  assert.match(noCurrent.message ?? "", /No attached run/);
  assert.ok(noCurrent.display);
  context.state.close();
});

test("validation command lists artifact validation gates", async () => {
  const context = makeContext();
  const runId = context.state.createRun({
    projectPath: context.config.projectPath,
    model: context.config.model,
    message: "validate",
  });
  context.state.createValidationGate({
    runId,
    subjectType: "artifact",
    subjectId: "index.html",
    status: "passed",
    summary: "html ok",
  });
  const listed = await runSlashCommand(`/validation ${runId} passed`, context);
  assert.match(listed.message ?? "", /index\.html/);
  assert.match(listed.message ?? "", /passed/);
  assert.ok(listed.display);
  context.state.close();
});

test("skills and plugins show commands load local metadata", async () => {
  const context = makeContext();
  const skillDir = path.join(context.config.projectPath, ".deepseekcode", "skills", "writer");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Writer\nUse concise prose.\n", "utf8");
  assert.match((await runSlashCommand("/skills", context)).message ?? "", /writer/);
  assert.match((await runSlashCommand("/skills show writer", context)).message ?? "", /Use concise prose/);
  assert.match((await runSlashCommand('/skills create verifier "verify changes carefully"', context)).message ?? "", /created skill project\/verifier/);
  assert.match((await runSlashCommand("/skills show verifier", context)).message ?? "", /description: verify changes carefully/);
  assert.match((await runSlashCommand("/skills run verifier check files", context)).message ?? "", /Provider missing/);
  assert.match((await runSlashCommand("/skills validate verifier", context)).message ?? "", /ok verifier/);
  const sourceSkill = path.join(context.config.projectPath, "source-skill");
  fs.mkdirSync(sourceSkill, { recursive: true });
  fs.writeFileSync(path.join(sourceSkill, "SKILL.md"), [
    "---",
    "name: source-skill",
    "description: Draft changelog entries",
    "---",
    "Draft concise changelog entries.",
    "",
  ].join("\n"), "utf8");
  assert.match((await runSlashCommand('/skills install "source-skill" changelog', context)).message ?? "", /installed skill project\/changelog/);
  assert.match((await runSlashCommand("/skills search changelog", context)).message ?? "", /project\/changelog/);
  assert.match((await runSlashCommand("/skills source changelog", context)).message ?? "", /source-skill/);
  fs.writeFileSync(path.join(sourceSkill, "SKILL.md"), [
    "---",
    "name: source-skill",
    "description: Draft updated changelog entries",
    "---",
    "Draft updated changelog entries.",
    "",
  ].join("\n"), "utf8");
  assert.match((await runSlashCommand("/skills update changelog", context)).message ?? "", /updated skill project\/changelog/);
  assert.match((await runSlashCommand("/skills show changelog", context)).message ?? "", /updated changelog/);
  assert.match((await runSlashCommand("/skills uninstall changelog", context)).message ?? "", /uninstalled skill changelog/);

  const pluginDir = path.join(context.config.projectPath, ".deepseekcode", "plugins", "demo", ".codex-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify({ name: "demo" }), "utf8");
  assert.match((await runSlashCommand("/plugins", context)).message ?? "", /demo/);
  assert.match((await runSlashCommand("/plugins show demo", context)).message ?? "", /"name": "demo"/);
  assert.match((await runSlashCommand('/plugins create helper "helper plugin"', context)).message ?? "", /created plugin project\/helper/);
  assert.match((await runSlashCommand("/plugins validate helper", context)).message ?? "", /ok helper/);
  assert.match((await runSlashCommand("/plugins path helper", context)).message ?? "", /helper/);
  assert.match((await runSlashCommand("/helper:hello smoke", context)).message ?? "", /DeepSeekCode plugin helper\/hello: smoke/);
  const sourcePlugin = path.join(context.config.projectPath, "source-plugin");
  fs.mkdirSync(path.join(sourcePlugin, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(path.join(sourcePlugin, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "source-plugin",
    description: "source plugin command pack",
    commands: [{ name: "ping", response: "pong {args}" }],
  }), "utf8");
  assert.match((await runSlashCommand('/plugins install "source-plugin" copied', context)).message ?? "", /installed plugin project\/copied/);
  assert.equal((await runSlashCommand("/copied:ping ok", context)).message, "pong ok");
  assert.match((await runSlashCommand("/plugins search command pack", context)).message ?? "", /project\/copied/);
  assert.match((await runSlashCommand("/plugins source copied", context)).message ?? "", /source-plugin/);
  fs.writeFileSync(path.join(sourcePlugin, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "source-plugin",
    description: "source plugin command pack",
    commands: [{ name: "ping", response: "updated {args}" }],
  }), "utf8");
  assert.match((await runSlashCommand("/plugins update copied", context)).message ?? "", /updated plugin project\/copied/);
  assert.equal((await runSlashCommand("/copied:ping ok", context)).message, "updated ok");
  assert.match((await runSlashCommand("/plugins uninstall copied", context)).message ?? "", /uninstalled plugin copied/);
  context.state.close();
});

test("plugin manifest commands are injected into slash command routing", async () => {
  const context = makeContext();
  const pluginDir = path.join(context.config.projectPath, ".deepseekcode", "plugins", "demo", ".codex-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify({
    name: "demo",
    description: "demo plugin",
    commands: [
      {
        name: "hello",
        description: "Say hello",
        response: "hello {args} from {plugin}/{command}",
      },
    ],
  }), "utf8");

  assert.match((await runSlashCommand("/plugins", context)).message ?? "", /\/demo:hello/);
  assert.match((await runSlashCommand("/help", context)).message ?? "", /\/demo:hello/);
  const result = await runSlashCommand("/demo:hello DeepSeekCode", context);
  assert.equal(result.message, "hello DeepSeekCode from demo/hello");
  context.state.close();
});

test("project markdown commands are injected as prompt slash commands", async () => {
  const context = makeContext();
  const commandDir = path.join(context.config.projectPath, ".deepseekcode", "commands");
  fs.mkdirSync(commandDir, { recursive: true });
  fs.writeFileSync(path.join(commandDir, "review.md"), [
    "---",
    "description: Review selected files",
    "usage: <path>",
    "aliases: inspect, audit",
    "---",
    "Review {args} in {project} using DeepSeekCode command {scope}:{command}.",
  ].join("\n"), "utf8");

  assert.match((await runSlashCommand("/help", context)).message ?? "", /\/project:review <path>/);
  const result = await runSlashCommand("/project:inspect src/index.ts", context);
  assert.match(result.message ?? "", /Running custom command/);
  assert.match(result.submit ?? "", /Review src\/index\.ts/);
  assert.match(result.submit ?? "", /project:review/);
  context.state.close();
});

test("cache markdown commands are injected with cache scope", async () => {
  const context = makeContext();
  const commandDir = path.join(context.config.dataDir, "cache", "commands");
  fs.mkdirSync(commandDir, { recursive: true });
  fs.writeFileSync(path.join(commandDir, "release-notes.md"), "Draft release notes for {args}.", "utf8");

  const result = await runSlashCommand("/cache:release-notes latest", context);
  assert.match(result.submit ?? "", /Draft release notes for latest/);
  context.state.close();
});

test("plugins command enables and disables plugin command injection", async () => {
  const context = makeContext();
  const pluginRoot = path.join(context.config.projectPath, ".deepseekcode", "plugins", "demo");
  const manifestDir = path.join(pluginRoot, ".codex-plugin");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, "plugin.json"), JSON.stringify({
    name: "demo",
    commands: [{ name: "hello", description: "Say hello", response: "hello" }],
  }), "utf8");

  assert.match((await runSlashCommand("/demo:hello", context)).message ?? "", /hello/);
  assert.match((await runSlashCommand("/plugins disable demo", context)).message ?? "", /disabled/);
  assert.match((await runSlashCommand("/demo:hello", context)).message ?? "", /Unknown command/);
  assert.match((await runSlashCommand("/plugins enable demo", context)).message ?? "", /enabled/);
  assert.match((await runSlashCommand("/demo:hello", context)).message ?? "", /hello/);
  context.state.close();
});

class FakeBtwProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";
  messages: ChatMessage[] = [];
  private lastUsage?: UsageSnapshot;

  async verifyModel(): Promise<ChatReply> {
    return this.completeChat([]);
  }

  async completeChat(messages: ChatMessage[]): Promise<ChatReply> {
    this.messages = messages;
    this.lastUsage = {
      inputTokens: 80,
      outputTokens: 12,
      cacheHitTokens: 32,
      cacheMissTokens: 48,
    };
    return {
      provider: this.providerName,
      model: this.model,
      text: "Side answer from DeepSeek: keep stable prefix blocks first and bound dynamic context.",
      ...this.lastUsage,
    };
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    return;
  }

  async classifyTurn(_input: string): Promise<TurnClassification> {
    return { task_kind: "chat", needs_local_tools: false, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    throw new Error("not used by /btw");
  }

  takeLastUsage(): UsageSnapshot | undefined {
    const usage = this.lastUsage;
    this.lastUsage = undefined;
    return usage;
  }
}

function fakeMcpServerSource(): string {
  return `
let buffer = "";
process.stdin.on("data", chunk => {
  buffer += chunk.toString();
  const parts = buffer.split(/\\r?\\n/);
  buffer = parts.pop() || "";
  for (const part of parts) {
    if (!part.trim()) continue;
    const message = JSON.parse(part);
    if (!message.id) continue;
    if (message.method === "initialize") {
      send(message.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake" } });
    } else if (message.method === "tools/list") {
      send(message.id, { tools: [{ name: "echo", description: "Echo text" }] });
    } else if (message.method === "tools/call") {
      send(message.id, { content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }] });
    }
  }
});
function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`;
}

function fakeSshSource(): string {
  return `
const args = process.argv.slice(2);
const command = args.at(-1) || "";
let input = "";
process.stdin.on("data", chunk => { input += chunk.toString(); });
process.stdin.on("end", finish);
setTimeout(finish, 20);
let done = false;
function finish() {
  if (done) return;
  done = true;
  if (command.includes("base64 -d >")) {
    process.stdout.write("wrote:" + Buffer.from(input.replace(/\\s+/g, ""), "base64").toString("utf8"));
    return;
  }
  const match = command.match(/base64 '([^']+)'/);
  if (match) {
    process.stdout.write(Buffer.from("remote-file:" + match[1] + "\\n", "utf8").toString("base64") + "\\n");
    return;
  }
  process.stdout.write("fake-ssh:" + command + "\\n");
}
`;
}
