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
import { AgentRunService } from "./agentRunService.js";

test("AgentRunService starts a durable agent run and steps it to completion", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "builder", "write_file, validate_artifact");
  const state = new StateStore(config.stateDbPath);
  const service = new AgentRunService(state, config);
  const started = service.start({ agent: "builder", task: "write durable file" });
  assert.equal(state.getRun(started.runId)?.status, "running");
  assert.equal(state.listTasks(started.runId)[0]?.status, "queued");
  assert.equal(service.list()[0]?.run.id, started.runId);
  assert.equal(service.detail(started.runId).tasks[0]?.id, started.taskId);

  const step = await service.step({
    runId: started.runId,
    provider: new FakeProvider({
      final_message: "durable agent done",
      needs_local_tools: true,
      acceptance_criteria: ["file exists"],
      actions: [
        {
          type: "write_file",
          path: "durable/agent.txt",
          content: "durable\n",
          encoding: "utf-8",
          overwrite: false,
        },
        {
          type: "validate_artifact",
          path: "durable/agent.txt",
        },
      ],
    }),
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(step.status, "succeeded");
  assert.equal(state.getRun(started.runId)?.status, "succeeded");
  assert.equal(state.listTasks(started.runId)[0]?.status, "succeeded");
  assert.equal(state.getRun(started.runId)?.actionCount, 2);
  assert.equal(fs.readFileSync(path.join(config.projectPath, "durable", "agent.txt"), "utf8"), "durable\n");
  assert.ok(state.listEvents(started.runId, 20).some((event) => event.kind === "agent_turn_completed"));
  state.close();
});

test("AgentRunService can append tasks and drain a run until it is idle", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "builder", "write_file");
  const state = new StateStore(config.stateDbPath);
  const service = new AgentRunService(state, config);
  const started = service.start({ agent: "builder", task: "write first file" });
  const secondTaskId = service.addTask({
    runId: started.runId,
    agent: "builder",
    task: "write second file",
  });
  assert.equal(state.listTasks(started.runId).some((task) => task.id === secondTaskId), true);

  const drain = await service.drain({
    runId: started.runId,
    provider: new FakeProvider([
      {
        final_message: "first done",
        needs_local_tools: true,
        acceptance_criteria: ["first file"],
        actions: [
          {
            type: "write_file",
            path: "drain/first.txt",
            content: "first\n",
            encoding: "utf-8",
            overwrite: false,
          },
        ],
      },
      {
        final_message: "second done",
        needs_local_tools: true,
        acceptance_criteria: ["second file"],
        actions: [
          {
            type: "write_file",
            path: "drain/second.txt",
            content: "second\n",
            encoding: "utf-8",
            overwrite: false,
          },
        ],
      },
    ]),
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(drain.status, "succeeded");
  assert.equal(drain.steps.length, 3);
  assert.equal(state.getRun(started.runId)?.status, "succeeded");
  assert.equal(fs.readFileSync(path.join(config.projectPath, "drain", "first.txt"), "utf8"), "first\n");
  assert.equal(fs.readFileSync(path.join(config.projectPath, "drain", "second.txt"), "utf8"), "second\n");
  state.close();
});

test("AgentRunService marks durable agent runs failed when execution fails", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "reader", "read_file");
  const state = new StateStore(config.stateDbPath);
  const service = new AgentRunService(state, config);
  const started = service.start({ agent: "reader", task: "attempt disallowed write" });

  const step = await service.step({
    runId: started.runId,
    provider: new FakeProvider({
      final_message: "blocked",
      needs_local_tools: true,
      acceptance_criteria: ["no write"],
      actions: [
        {
          type: "write_file",
          path: "blocked.txt",
          content: "blocked\n",
          encoding: "utf-8",
          overwrite: false,
        },
      ],
    }),
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(step.status, "failed");
  assert.equal(state.getRun(started.runId)?.status, "failed");
  assert.equal(state.listTasks(started.runId)[0]?.status, "failed");
  assert.equal(fs.existsSync(path.join(config.projectPath, "blocked.txt")), false);
  state.close();
});

function makeConfig(): RuntimeConfig {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-run-service-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-run-service-data-"));
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

class FakeProvider implements DeepSeekProviderClient {
  providerName = "fake";
  model = "deepseek-v4-flash";
  private planIndex = 0;
  private readonly envelopes: ActionEnvelope[];

  constructor(envelope: ActionEnvelope | ActionEnvelope[]) {
    this.envelopes = Array.isArray(envelope) ? envelope : [envelope];
  }

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
    const envelope = this.envelopes[Math.min(this.planIndex, this.envelopes.length - 1)]!;
    this.planIndex += 1;
    return envelope;
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }

  private reply(text: string): ChatReply {
    return { provider: this.providerName, model: this.model, text };
  }
}
