import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { executeEnvelope } from "./executor.js";
import { StateStore } from "../state/sqlite.js";
import { SshProfileService } from "../services/remote/sshProfileService.js";
import { FileStateCache } from "../utils/fileStateCache.js";
import { readFileEditApprovalPreview } from "../services/approval/fileEditApprovalPreview.js";

test("executeEnvelope writes, reads, and validates an artifact", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["html exists"],
    final_message: "done",
    actions: [
      {
        type: "write_file",
        path: "index.html",
        content: "<!doctype html><html><body>ok</body></html>",
        encoding: "utf-8",
        overwrite: true,
      },
      { type: "read_file", path: "index.html", encoding: "utf-8" },
      { type: "validate_artifact", path: "index.html", expected_kind: "html" },
    ],
  });
  assert.equal(report.status, "succeeded");
  assert.equal(report.results.length, 3);
  assert.equal(fs.existsSync(path.join(root, "index.html")), true);
});

test("executeEnvelope denies shell by default", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["command denied"],
    final_message: "done",
    actions: [
      {
        type: "run_command",
        command: "node --version",
        cwd: "",
        timeout_ms: 1000,
      },
    ],
  });
  assert.equal(report.status, "failed");
  assert.match(report.results[0]?.message ?? "", /disabled|denied/i);
});

test("executeEnvelope can run a configured SSH profile through a fake ssh binary", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const fakeSsh = path.join(root, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, [
    "const args = process.argv.slice(2);",
    "process.stdout.write(`remote:${args.at(-1)}\\n`);",
  ].join("\n"), "utf8");
  new SshProfileService(root).addProfile({
    name: "staging",
    host: "example.com",
    user: "deploy",
    remotePath: "/srv/app",
  });
  const previousSshBin = process.env.DEEPSEEKCODE_SSH_BIN;
  const previousSshBinArgs = process.env.DEEPSEEKCODE_SSH_BIN_ARGS;
  process.env.DEEPSEEKCODE_SSH_BIN = process.execPath;
  process.env.DEEPSEEKCODE_SSH_BIN_ARGS = JSON.stringify([fakeSsh]);
  try {
    const report = await executeEnvelope(root, {
      needs_local_tools: true,
      acceptance_criteria: ["remote command runs"],
      final_message: "done",
      actions: [
        {
          type: "ssh_run",
          profile: "staging",
          command: "echo remote-ok",
          timeout_ms: 5_000,
        },
      ],
    }, { shellPolicy: { allowShell: true, maxTimeoutMs: 30_000, maxOutputChars: 8_000 } });
    assert.equal(report.status, "succeeded");
    assert.match(report.results[0]?.message ?? "", /remote-ok/);
    assert.match(new SshProfileService(root).listCommandRecords()[0]?.command ?? "", /echo remote-ok/);
  } finally {
    if (previousSshBin === undefined) delete process.env.DEEPSEEKCODE_SSH_BIN;
    else process.env.DEEPSEEKCODE_SSH_BIN = previousSshBin;
    if (previousSshBinArgs === undefined) delete process.env.DEEPSEEKCODE_SSH_BIN_ARGS;
    else process.env.DEEPSEEKCODE_SSH_BIN_ARGS = previousSshBinArgs;
  }
});

test("executeEnvelope can read and write remote SSH text files through fake ssh", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const fakeSsh = path.join(root, "fake-ssh.js");
  fs.writeFileSync(fakeSsh, fakeSshFileSource(), "utf8");
  new SshProfileService(root).addProfile({
    name: "staging",
    host: "example.com",
    user: "deploy",
    remotePath: "/srv/app",
  });
  const previousSshBin = process.env.DEEPSEEKCODE_SSH_BIN;
  const previousSshBinArgs = process.env.DEEPSEEKCODE_SSH_BIN_ARGS;
  process.env.DEEPSEEKCODE_SSH_BIN = process.execPath;
  process.env.DEEPSEEKCODE_SSH_BIN_ARGS = JSON.stringify([fakeSsh]);
  try {
    const report = await executeEnvelope(root, {
      needs_local_tools: true,
      acceptance_criteria: ["remote file roundtrip"],
      final_message: "done",
      actions: [
        {
          type: "ssh_read_file",
          profile: "staging",
          path: "remote.txt",
          encoding: "utf-8",
          timeout_ms: 5_000,
        },
        {
          type: "ssh_write_file",
          profile: "staging",
          path: "out/remote.txt",
          content: "tool payload\n",
          encoding: "utf-8",
          overwrite: true,
          timeout_ms: 5_000,
        },
      ],
    }, { shellPolicy: { allowShell: true, maxTimeoutMs: 30_000, maxOutputChars: 8_000 } });
    assert.equal(report.status, "succeeded");
    assert.match(report.results[0]?.message ?? "", /17 bytes/);
    assert.match(report.results[1]?.message ?? "", /13 bytes/);
    const records = new SshProfileService(root).listCommandRecords();
    assert.match(records.map((record) => record.command).join("\n"), /base64 'remote\.txt'/);
    assert.match(records.map((record) => record.stdout).join("\n"), /wrote:tool payload/);
  } finally {
    if (previousSshBin === undefined) delete process.env.DEEPSEEKCODE_SSH_BIN;
    else process.env.DEEPSEEKCODE_SSH_BIN = previousSshBin;
    if (previousSshBinArgs === undefined) delete process.env.DEEPSEEKCODE_SSH_BIN_ARGS;
    else process.env.DEEPSEEKCODE_SSH_BIN_ARGS = previousSshBinArgs;
  }
});

test("executeEnvelope can require durable approval before destructive tools", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-approval-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({
    projectPath: root,
    model: "deepseek-v4-flash",
    message: "approval gated write",
  });
  const envelope = {
    needs_local_tools: true,
    acceptance_criteria: ["file needs approval"],
    final_message: "done",
    actions: [
      {
        type: "write_file" as const,
        path: "approved.txt",
        content: "approved\n",
        encoding: "utf-8",
        overwrite: true,
      },
    ],
  };

  const blocked = await executeEnvelope(root, envelope, {
    approvalPolicy: { state, runId, mode: "manual" },
  });
  assert.equal(blocked.status, "failed");
  assert.match(blocked.results[0]?.message ?? "", /Approval required/);
  assert.equal(fs.existsSync(path.join(root, "approved.txt")), false);
  const gate = state.listApprovalGates({ status: "pending" })[0];
  assert.match(gate?.summary ?? "", /write_file path=approved\.txt/);
  assert.match(gate?.summary ?? "", /lines=\d+/);
  assert.match(gate?.summary ?? "", /projected=ok/);
  assert.match(gate?.summary ?? "", /exists=false/);
  assert.match(gate?.summary ?? "", /added=1/);
  assert.match(gate?.summary ?? "", /removed=0/);
  assert.match(gate?.summary ?? "", /sha=[a-f0-9]{12}/);
  const writePreview = readFileEditApprovalPreview(root, gate!.id);
  assert.equal(writePreview?.status, "ok");
  assert.equal(writePreview?.relativePath, "approved.txt");
  assert.equal(writePreview?.added, 1);
  assert.equal(writePreview?.removed, 0);
  assert.match(writePreview?.diffLines.join("\n") ?? "", /\+approved/);

  state.decideApprovalGate(gate!.id, "approved", "expected test write");
  const approved = await executeEnvelope(root, envelope, {
    approvalPolicy: { state, runId, mode: "manual" },
  });
  assert.equal(approved.status, "succeeded");
  assert.equal(fs.readFileSync(path.join(root, "approved.txt"), "utf8"), "approved\n");

  const patchBlocked = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["patch needs approval"],
    final_message: "done",
    actions: [
      {
        type: "apply_patch" as const,
        path: "approved.txt",
        edits: [{ search: "approved\n", replace: "approved!\nextra\n" }],
        encoding: "utf-8",
      },
    ],
  }, {
    approvalPolicy: { state, runId, mode: "manual" },
  });
  assert.equal(patchBlocked.status, "failed");
  const patchGate = state.listApprovalGates({ status: "pending" })[0];
  assert.match(patchGate?.summary ?? "", /apply_patch path=approved\.txt/);
  assert.match(patchGate?.summary ?? "", /projected=ok/);
  assert.match(patchGate?.summary ?? "", /exists=true/);
  assert.match(patchGate?.summary ?? "", /added=2/);
  assert.match(patchGate?.summary ?? "", /removed=1/);
  const patchPreview = readFileEditApprovalPreview(root, patchGate!.id);
  assert.equal(patchPreview?.status, "ok");
  assert.equal(patchPreview?.added, 2);
  assert.equal(patchPreview?.removed, 1);
  assert.match(patchPreview?.diffLines.join("\n") ?? "", /-approved/);
  assert.match(patchPreview?.diffLines.join("\n") ?? "", /\+approved!/);
  state.close();
});

test("executeEnvelope updates Claude-style todos through TodoWrite", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["todos tracked"],
    final_message: "done",
    actions: [
      {
        type: "TodoWrite",
        scope: "project",
        todos: [
          {
            content: "Inspect files",
            activeForm: "Inspecting files",
            status: "in_progress",
          },
          {
            content: "Run tests",
            activeForm: "Running tests",
            status: "pending",
          },
        ],
      },
    ],
  });
  assert.equal(report.status, "succeeded");
  assert.match(report.results[0]?.message ?? "", /Inspect files/);
  assert.match(fs.readFileSync(path.join(root, ".deepseekcode", "todos.json"), "utf8"), /Run tests/);
});

test("executeEnvelope supports EnterPlanMode and ExitPlanMode approval gates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plan-tools-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-plan-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({
    projectPath: root,
    model: "deepseek-v4-flash",
    message: "plan mode",
  });
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["plan approval requested"],
    final_message: "plan ready",
    actions: [
      { type: "EnterPlanMode", goal: "Add local plan mode" },
      {
        type: "ExitPlanMode",
        plan: "## Plan\n1. Add service\n2. Add tests\n",
        summary: "Approve local plan mode",
      },
    ],
  }, { state, runId });

  assert.equal(report.status, "failed");
  assert.match(report.results[0]?.message ?? "", /Entered plan mode/);
  assert.match(report.results[1]?.message ?? "", /Approval required/);
  assert.match(fs.readFileSync(path.join(root, ".deepseekcode", "plans", `${runId}.md`), "utf8"), /Add service/);
  const gate = state.listApprovalGates({ subjectType: "plan", subjectId: runId })[0];
  assert.equal(gate?.status, "pending");
  assert.equal(state.getRun(runId)?.status, "paused");
  state.close();
});

test("executeEnvelope supports AskUserQuestion clarification gates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-question-tools-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-question-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const runId = state.createRun({
    projectPath: root,
    model: "deepseek-v4-flash",
    message: "ask user question",
  });
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["question requested"],
    final_message: "need answer",
    actions: [{
      type: "AskUserQuestion",
      questions: [{
        header: "Approach",
        question: "Which implementation path should DeepSeekCode use?",
        options: [
          { label: "Small", description: "Minimal change" },
          { label: "Full", description: "Full workflow" },
        ],
      }],
    }],
  }, { state, runId });

  assert.equal(report.status, "failed");
  assert.match(report.results[0]?.message ?? "", /Question awaiting user answer/);
  const gate = state.listApprovalGates({ subjectType: "question" })[0];
  assert.equal(gate?.status, "pending");
  assert.equal(state.getRun(runId)?.status, "paused");
  state.close();
});

test("executeEnvelope gates browser CDP tools behind permission and configuration", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const denied = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["browser denied"],
    final_message: "",
    actions: [{ type: "browser_snapshot", url: "https://example.com" }],
  });
  assert.equal(denied.status, "failed");
  assert.match(denied.results[0]?.message ?? "", /Browser control is disabled/);

  const previous = process.env.DEEPSEEKCODE_BROWSER_CDP_URL;
  delete process.env.DEEPSEEKCODE_BROWSER_CDP_URL;
  const unconfigured = await executeEnvelope(root, {
    needs_local_tools: true,
    acceptance_criteria: ["browser configured"],
    final_message: "",
    actions: [{ type: "browser_snapshot", url: "https://example.com" }],
  }, { browserPolicy: { allowBrowser: true } });
  if (previous === undefined) delete process.env.DEEPSEEKCODE_BROWSER_CDP_URL;
  else process.env.DEEPSEEKCODE_BROWSER_CDP_URL = previous;
  assert.equal(unconfigured.status, "failed");
  assert.match(unconfigured.results[0]?.message ?? "", /DEEPSEEKCODE_BROWSER_CDP_URL/);
});

test("executeEnvelope supports glob and grep search tools", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const marker = true;\n", "utf8");
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [
      { type: "glob_files", path: "", pattern: "**/*.ts", max_results: 10 },
      { type: "grep_files", path: "", pattern: "marker", include: "**/*.ts", max_results: 10 },
    ],
  });
  assert.equal(report.status, "succeeded");
  assert.match(report.results[0]?.message ?? "", /src\/index.ts/);
  assert.match(report.results[1]?.message ?? "", /marker/);
});

test("executeEnvelope can load a project skill into tool feedback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-data-"));
  const skillDir = path.join(root, ".deepseekcode", "skills", "writer");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Writer\nWrite concise implementation notes.\n", "utf8");

  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [{ type: "invoke_skill", name: "writer", task: "summarize changes" }],
  }, { dataDir });

  assert.equal(report.status, "succeeded");
  assert.match(report.results[0]?.message ?? "", /Write concise implementation notes/);
});

test("executeEnvelope can load a project agent into tool feedback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-data-"));
  const agentDir = path.join(root, ".deepseekcode", "agents");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "reviewer.md"), [
    "---",
    "name: reviewer",
    "description: Review generated diffs",
    "tools: read_file, grep_files",
    "---",
    "Inspect patches and report high-confidence issues.",
    "",
  ].join("\n"), "utf8");

  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [{ type: "invoke_agent", name: "reviewer", task: "review patch" }],
  }, { dataDir });

  assert.equal(report.status, "succeeded");
  assert.match(report.results[0]?.message ?? "", /agent project\/reviewer loaded/);
  assert.match(report.results[0]?.message ?? "", /Inspect patches/);
});

test("executeEnvelope can call a configured stdio MCP tool", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const serverPath = path.join(root, "fake-mcp.js");
  fs.writeFileSync(serverPath, fakeMcpServerSource(), "utf8");
  fs.mkdirSync(path.join(root, ".deepseekcode"), { recursive: true });
  fs.writeFileSync(path.join(root, ".deepseekcode", "mcp.json"), JSON.stringify({
    servers: [{
      name: "fake",
      type: "stdio",
      command: `node "${serverPath}"`,
      args: [],
      env: {},
      enabled: true,
      description: "",
    }],
  }), "utf8");

  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [{ type: "mcp_call", server: "fake", tool: "echo", arguments: { text: "from-tool" }, timeout_ms: 5_000 }],
  }, { shellPolicy: { allowShell: true, maxTimeoutMs: 30_000, maxOutputChars: 8_000 } });

  assert.equal(report.status, "succeeded");
  assert.match(report.results[0]?.message ?? "", /from-tool/);
});

test("executeEnvelope can call a configured HTTP MCP tool without shell permission", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  const server = createFakeHttpMcpServer();
  const url = await listen(server);
  try {
    fs.mkdirSync(path.join(root, ".deepseekcode"), { recursive: true });
    fs.writeFileSync(path.join(root, ".deepseekcode", "mcp.json"), JSON.stringify({
      servers: [{
        name: "remote",
        type: "http",
        url,
        args: [],
        env: {},
        enabled: true,
        description: "",
      }],
    }), "utf8");

    const report = await executeEnvelope(root, {
      needs_local_tools: true,
      final_message: "",
      acceptance_criteria: [],
      actions: [{ type: "mcp_call", server: "remote", tool: "echo", arguments: { text: "from-http-tool" }, timeout_ms: 5_000 }],
    });

    assert.equal(report.status, "succeeded");
    assert.match(report.results[0]?.message ?? "", /from-http-tool/);
  } finally {
    server.close();
  }
});

test("executeEnvelope rejects stale patches when file state cache is enabled", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  fs.writeFileSync(path.join(root, "note.txt"), "old", "utf8");
  const cache = new FileStateCache();
  await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [{ type: "read_file", path: "note.txt", encoding: "utf-8" }],
  }, { fileStateCache: cache });
  fs.writeFileSync(path.join(root, "note.txt"), "changed", "utf8");
  const report = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [
      {
        type: "apply_patch",
        path: "note.txt",
        edits: [{ search: "changed", replace: "new" }],
        encoding: "utf-8",
      },
    ],
  }, { fileStateCache: cache });
  assert.equal(report.status, "failed");
  assert.match(report.results[0]?.message ?? "", /stale patch/);
});

test("executeEnvelope rejects stale overwrite writes when file state cache is enabled", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-tools-"));
  fs.writeFileSync(path.join(root, "note.txt"), "old", "utf8");
  const cache = new FileStateCache();
  await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [{ type: "read_file", path: "note.txt", encoding: "utf-8" }],
  }, { fileStateCache: cache });
  fs.writeFileSync(path.join(root, "note.txt"), "changed", "utf8");

  const denied = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [
      {
        type: "write_file",
        path: "note.txt",
        content: "new",
        encoding: "utf-8",
        overwrite: true,
      },
    ],
  }, { fileStateCache: cache });
  assert.equal(denied.status, "failed");
  assert.match(denied.results[0]?.message ?? "", /stale write/);

  await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [{ type: "read_file", path: "note.txt", encoding: "utf-8" }],
  }, { fileStateCache: cache });
  const allowed = await executeEnvelope(root, {
    needs_local_tools: true,
    final_message: "",
    acceptance_criteria: [],
    actions: [
      {
        type: "write_file",
        path: "note.txt",
        content: "new",
        encoding: "utf-8",
        overwrite: true,
      },
    ],
  }, { fileStateCache: cache });
  assert.equal(allowed.status, "succeeded");
  assert.equal(fs.readFileSync(path.join(root, "note.txt"), "utf8"), "new");
});

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
    if (message.method === "initialize") send(message.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake" } });
    else if (message.method === "tools/list") send(message.id, { tools: [{ name: "echo", description: "Echo text" }] });
    else if (message.method === "tools/call") send(message.id, { content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }] });
  }
});
function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`;
}

function fakeSshFileSource(): string {
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
  process.stdout.write(Buffer.from("remote tool file\\n", "utf8").toString("base64") + "\\n");
}
`;
}

function createFakeHttpMcpServer(): http.Server {
  return http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const message = JSON.parse(body);
      if (!message.id) {
        response.writeHead(202).end();
        return;
      }
      const result = message.method === "initialize"
        ? { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-http" } }
        : message.method === "tools/list"
          ? { tools: [{ name: "echo", description: "Echo text" }] }
          : { content: [{ type: "text", text: String(message.params?.arguments?.text ?? "") }] };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing test server address");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
