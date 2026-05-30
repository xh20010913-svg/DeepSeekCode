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
import { runSkillTask } from "./skillRunner.js";

test("runSkillTask plans with skill instructions and executes local tools", async () => {
  const config = makeConfig();
  writeSkill(config.projectPath, "writer", "Write useful files");
  const provider = new FakeProvider({
    final_message: "skill wrote file",
    needs_local_tools: true,
    acceptance_criteria: ["skill file exists"],
    actions: [
      {
        type: "write_file",
        path: "skill/output.txt",
        content: "from skill\n",
        overwrite: false,
        encoding: "utf-8",
      },
      {
        type: "validate_artifact",
        path: "skill/output.txt",
      },
    ],
  });

  const result = await runSkillTask({
    name: "writer",
    task: "write a file",
    config,
    provider,
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.turns.length, 1);
  assert.equal(fs.readFileSync(path.join(config.projectPath, "skill", "output.txt"), "utf8"), "from skill\n");
  assert.match(provider.lastPlan?.userMessage ?? "", /<skill_instructions>/);
  assert.match(provider.lastPlan?.userMessage ?? "", /write a file/);
});

test("runSkillTask retries failed tool plans with feedback", async () => {
  const config = makeConfig();
  writeSkill(config.projectPath, "repair", "Repair missing artifacts");
  const provider = new FakeProvider([
    {
      final_message: "missing",
      needs_local_tools: true,
      acceptance_criteria: ["fixed"],
      actions: [
        {
          type: "validate_artifact",
          path: "repair/missing.txt",
        },
      ],
    },
    {
      final_message: "fixed",
      needs_local_tools: true,
      acceptance_criteria: ["fixed"],
      actions: [
        {
          type: "write_file",
          path: "repair/missing.txt",
          content: "fixed\n",
          overwrite: false,
          encoding: "utf-8",
        },
      ],
    },
  ]);

  const result = await runSkillTask({
    name: "repair",
    task: "repair the file",
    config,
    provider,
    permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
  });

  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.turns.length, 2);
  assert.equal(provider.plans[1]?.feedback?.status, "failed");
  assert.equal(fs.readFileSync(path.join(config.projectPath, "repair", "missing.txt"), "utf8"), "fixed\n");
});

test("runSkillTask respects disable-model-invocation frontmatter", async () => {
  const config = makeConfig();
  writeSkill(config.projectPath, "manual", "Manual only", { disableModelInvocation: true });
  await assert.rejects(
    runSkillTask({
      name: "manual",
      task: "run anyway",
      config,
      provider: new FakeProvider({
        final_message: "unused",
        needs_local_tools: false,
        acceptance_criteria: [],
        actions: [],
      }),
      permissions: { allowShell: false, allowBrowser: false, profile: "safe" },
    }),
    /disables model invocation/,
  );
});

function makeConfig(): RuntimeConfig {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-runner-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-skill-runner-data-"));
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

function writeSkill(
  projectPath: string,
  name: string,
  description: string,
  options: { disableModelInvocation?: boolean } = {},
): void {
  const dir = path.join(projectPath, ".deepseekcode", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    ...(options.disableModelInvocation ? ["disable-model-invocation: true"] : []),
    "---",
    "",
    `Use this skill to ${description.toLowerCase()}.`,
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
  private readonly envelopes: ActionEnvelope[];
  private planIndex = 0;

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
