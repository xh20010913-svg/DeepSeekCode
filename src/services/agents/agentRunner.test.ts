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
import { runAgentTask } from "./agentRunner.js";

test("runAgentTask asks the provider to plan and executes allowed tools", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "builder", "write_file, validate_artifact");
  const provider = new FakeProvider({
    final_message: "created note",
    needs_local_tools: true,
    acceptance_criteria: ["note exists"],
    actions: [
      {
        type: "write_file",
        path: "notes/agent.txt",
        content: "hello from agent\n",
        overwrite: false,
        encoding: "utf-8",
      },
      {
        type: "validate_artifact",
        path: "notes/agent.txt",
      },
    ],
  });

  const result = await runAgentTask({
    name: "builder",
    task: "create a note",
    config,
    provider,
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.turns.length, 1);
  assert.equal(fs.readFileSync(path.join(config.projectPath, "notes", "agent.txt"), "utf8"), "hello from agent\n");
  assert.match(provider.lastPlan?.userMessage ?? "", /Subagent: builder/);
  assert.match(provider.lastPlan?.userMessage ?? "", /create a note/);
});

test("runAgentTask blocks tools outside an agent frontmatter allowlist", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "reader", "read_file");
  const provider = new FakeProvider({
    final_message: "should not write",
    needs_local_tools: true,
    acceptance_criteria: ["no write"],
    actions: [
      {
        type: "write_file",
        path: "blocked.txt",
        content: "blocked\n",
        overwrite: false,
        encoding: "utf-8",
      },
    ],
  });

  const result = await runAgentTask({
    name: "reader",
    task: "try to write",
    config,
    provider,
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(result.execution.status, "failed");
  assert.match(result.execution.final_message, /not allowed to use tool: write_file/);
  assert.equal(fs.existsSync(path.join(config.projectPath, "blocked.txt")), false);
});

test("runAgentTask retries failed turns with feedback up to agent max-turns", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "repairer", "validate_artifact, write_file", { maxTurns: 2 });
  const provider = new FakeProvider([
    {
      final_message: "first check failed",
      needs_local_tools: true,
      acceptance_criteria: ["artifact exists"],
      actions: [
        {
          type: "validate_artifact",
          path: "repair/out.txt",
        },
      ],
    },
    {
      final_message: "repaired artifact",
      needs_local_tools: true,
      acceptance_criteria: ["artifact exists"],
      actions: [
        {
          type: "write_file",
          path: "repair/out.txt",
          content: "fixed\n",
          overwrite: false,
          encoding: "utf-8",
        },
      ],
    },
  ]);

  const result = await runAgentTask({
    name: "repairer",
    task: "repair missing artifact",
    config,
    provider,
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.turns.length, 2);
  assert.equal(provider.plans[1]?.feedback?.status, "failed");
  assert.equal(fs.readFileSync(path.join(config.projectPath, "repair", "out.txt"), "utf8"), "fixed\n");
});

test("runAgentTask blocks disallowed tools even when no allowlist is configured", async () => {
  const config = makeConfig();
  writeAgent(config.projectPath, "guarded", undefined, { disallowedTools: "run_command" });
  const provider = new FakeProvider({
    final_message: "try shell",
    needs_local_tools: true,
    acceptance_criteria: ["no shell"],
    actions: [
      {
        type: "run_command",
        command: "node --version",
        cwd: "",
        timeout_ms: 1000,
      },
    ],
  });

  const result = await runAgentTask({
    name: "guarded",
    task: "try shell",
    config,
    provider,
    permissions: { allowShell: true, allowBrowser: false, profile: "custom" },
  });

  assert.equal(result.execution.status, "failed");
  assert.equal(result.turns.length, 1);
  assert.match(result.execution.final_message, /not allowed to use tool: run_command/);
});

function makeConfig(): RuntimeConfig {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-runner-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-agent-runner-data-"));
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

function writeAgent(
  projectPath: string,
  name: string,
  tools?: string,
  options: { disallowedTools?: string; maxTurns?: number } = {},
): void {
  const dir = path.join(projectPath, ".deepseekcode", "agents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), [
    "---",
    `name: ${name}`,
    `description: ${name} test agent`,
    ...(tools ? [`tools: ${tools}`] : []),
    ...(options.disallowedTools ? [`disallowed-tools: ${options.disallowedTools}`] : []),
    ...(options.maxTurns ? [`max-turns: ${options.maxTurns}`] : []),
    "---",
    "",
    `You are ${name}. Finish the delegated task.`,
    "",
  ].join("\n"), "utf8");
}

class FakeProvider implements DeepSeekProviderClient {
  providerName = "fake";
  model = "deepseek-v4-flash";
  plans: Array<{
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }> = [];
  lastPlan?: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  };
  private planIndex = 0;

  constructor(envelope: ActionEnvelope | ActionEnvelope[]) {
    this.envelopes = Array.isArray(envelope) ? envelope : [envelope];
  }

  private readonly envelopes: ActionEnvelope[];

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

  async planActions(input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    this.lastPlan = input;
    this.plans.push(input);
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
