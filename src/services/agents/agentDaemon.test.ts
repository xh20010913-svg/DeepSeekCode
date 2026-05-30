import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import type { ActionEnvelope, ActionExecutionReport } from "../../protocol/actions.js";
import type {
  ChatMessage,
  ChatReply,
  ChatStreamEvent,
  DeepSeekProviderClient,
  TurnClassification,
  UsageSnapshot,
} from "../../protocol/provider.js";
import { StateStore } from "../../state/sqlite.js";
import { AgentDaemonService } from "./agentDaemon.js";
import { AgentRunService } from "./agentRunService.js";

test("AgentDaemonService drains unfinished agent runs with bounded steps", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "builder", "write_file");
  const state = new StateStore(config.stateDbPath);
  const runs = new AgentRunService(state, config);
  const first = runs.start({ agent: "builder", task: "write first" });
  const second = runs.start({ agent: "builder", task: "write second" });
  const daemon = new AgentDaemonService(state, config);

  const result = await daemon.tick({
    provider: new FakeProvider([
      envelope("daemon/first.txt", "first\n"),
      envelope("daemon/second.txt", "second\n"),
    ]),
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
    maxRuns: 2,
    maxStepsPerRun: 2,
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.runCount, 2);
  assert.equal(state.getRun(first.runId)?.status, "succeeded");
  assert.equal(state.getRun(second.runId)?.status, "succeeded");
  assert.equal(fs.readFileSync(path.join(config.projectPath, "daemon", "first.txt"), "utf8"), "first\n");
  assert.equal(fs.readFileSync(path.join(config.projectPath, "daemon", "second.txt"), "utf8"), "second\n");
  assert.ok(state.listEvents(undefined, 20).some((event) => event.kind === "agent_daemon_tick_finished"));
  state.close();
});

test("AgentDaemonService reports idle when no unfinished agent runs exist", async () => {
  const config = makeConfig();
  const state = new StateStore(config.stateDbPath);
  const result = await new AgentDaemonService(state, config).tick({
    provider: new FakeProvider([]),
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });
  assert.equal(result.status, "idle");
  assert.equal(result.runCount, 0);
  state.close();
});

function makeConfig(): RuntimeConfig {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-daemon-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-daemon-data-"));
  return {
    projectPath,
    dataDir,
    stateDbPath: path.join(dataDir, "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: false,
    browserEnabled: false,
    permissionProfile: "safe",
  };
}

function writeAgent(projectPath: string, name: string, tools: string): void {
  const dir = path.join(projectPath, ".deepseekcode", "agents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), [
    "---",
    `name: ${name}`,
    `description: ${name} test agent`,
    `tools: ${tools}`,
    "---",
    "",
    `You are ${name}. Finish the delegated task.`,
    "",
  ].join("\n"), "utf8");
}

function envelope(filePath: string, content: string): ActionEnvelope {
  return {
    final_message: `wrote ${filePath}`,
    needs_local_tools: true,
    acceptance_criteria: ["file exists"],
    actions: [
      {
        type: "write_file",
        path: filePath,
        content,
        encoding: "utf-8",
        overwrite: false,
      },
    ],
  };
}

class FakeProvider implements DeepSeekProviderClient {
  providerName = "fake";
  model = "deepseek-v4-flash";
  private planIndex = 0;

  constructor(private readonly envelopes: ActionEnvelope[]) {}

  async verifyModel(): Promise<ChatReply> {
    return this.reply("ok");
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    return this.reply("ok");
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    yield { type: "text_delta", text: "ok" };
  }

  async classifyTurn(_input: string): Promise<TurnClassification> {
    return { task_kind: "test", needs_local_tools: true, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    const envelope = this.envelopes[Math.min(this.planIndex, this.envelopes.length - 1)];
    this.planIndex += 1;
    if (!envelope) throw new Error("no fake envelope configured");
    return envelope;
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }

  private reply(text: string): ChatReply {
    return { provider: this.providerName, model: this.model, text };
  }
}
