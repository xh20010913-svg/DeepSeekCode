import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeConfig } from "../bootstrap/config.js";
import type {
  ChatMessage,
  ChatReply,
  ChatStreamEvent,
  DeepSeekProviderClient,
  TurnClassification,
  UsageSnapshot,
} from "../protocol/provider.js";
import type { ActionEnvelope, ActionExecutionReport } from "../protocol/actions.js";
import { HookService } from "../services/hooks/hookService.js";
import { StateStore } from "../state/sqlite.js";
import { QueryEngine } from "./QueryEngine.js";

class FakeProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";
  private usage?: UsageSnapshot;

  async verifyModel(): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    this.usage = { inputTokens: 12, outputTokens: 2, cacheHitTokens: 8, cacheMissTokens: 4 };
    return { provider: this.providerName, model: this.model, text: "ok", ...this.usage };
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    yield { type: "text_delta", text: "hello" };
    yield { type: "usage", inputTokens: 10, outputTokens: 1, cacheHitTokens: 9, cacheMissTokens: 1 };
  }

  async classifyTurn(input: string): Promise<TurnClassification> {
    this.usage = { inputTokens: 7, outputTokens: 1, cacheHitTokens: 5, cacheMissTokens: 2 };
    return {
      task_kind: input.includes("写") ? "file_change" : "chat",
      needs_local_tools: input.includes("写"),
      reason: "fake classifier",
    };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    this.usage = { inputTokens: 100, outputTokens: 20, cacheHitTokens: 80, cacheMissTokens: 20 };
    return {
      task_kind: "file_change",
      needs_local_tools: true,
      acceptance_criteria: ["index.html exists"],
      final_message: "已创建测试页面。",
      actions: [
        {
          type: "write_file",
          path: "index.html",
          content: "<!doctype html><html><body>DeepSeekCode</body></html>",
          encoding: "utf-8",
          overwrite: true,
        },
        { type: "validate_artifact", path: "index.html", expected_kind: "html" },
      ],
    };
  }

  takeLastUsage(): UsageSnapshot | undefined {
    const usage = this.usage;
    this.usage = undefined;
    return usage;
  }
}

test("QueryEngine turns a provider action envelope into local files and state", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
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
  const engine = new QueryEngine({
    config,
    state,
    provider: new FakeProvider(),
  });

  const events = [];
  for await (const event of engine.submit("写一个测试网页")) {
    events.push(event);
  }

  assert.equal(fs.existsSync(path.join(projectPath, "index.html")), true);
  assert.equal(state.listRuns(1)[0]?.status, "succeeded");
  assert.equal(state.listRuns(1)[0]?.actionCount, 2);
  assert.ok(events.some((event) => event.type === "tool_start"));
  assert.ok(events.some((event) => event.type === "tool_result"));
  assert.ok(events.some((event) =>
    event.type === "command_display" && event.fallbackText?.includes("DeepSeek cache guard:")));
  assert.ok(events.some((event) => event.type === "assistant" && event.text.includes("已创建")));
  assert.ok(state.listEvents(undefined, 20).some((event) => event.kind === "stable_prompt_prepared"));
  const guardEvent = state.listEvents(undefined, 50).find((event) => event.kind === "cache_guard");
  assert.ok(guardEvent);
  assert.equal((guardEvent.payload as { policy_min_hit_rate?: number }).policy_min_hit_rate, 0.35);
  assert.ok(state.listEvents(undefined, 50).some((event) => event.kind === "workspace_checkpoint_created"));
  assert.equal(fs.existsSync(path.join(projectPath, ".deepseekcode", "checkpoints")), true);
  state.close();
});

test("QueryEngine reports missing provider without creating local files", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const engine = new QueryEngine({
    config: {
      projectPath,
      dataDir,
      stateDbPath: path.join(dataDir, "state.sqlite"),
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    state,
    provider: null,
  });
  const events = [];
  for await (const event of engine.submit("你好")) events.push(event);
  assert.ok(events.some((event) => event.type === "error"));
  assert.equal(state.listRuns(10).length, 0);
  state.close();
});

test("QueryEngine surfaces slash command React displays for the TUI", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const engine = new QueryEngine({
    config: {
      projectPath,
      dataDir,
      stateDbPath: path.join(dataDir, "state.sqlite"),
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    state,
    provider: null,
  });
  const events = [];
  for await (const event of engine.submit("/help")) events.push(event);
  assert.ok(events.some((event) => event.type === "command_display"));
  assert.equal(state.listRuns(10).length, 0);
  state.close();
});

test("QueryEngine blocks planned tools when a PreToolUse hook denies them", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const config: RuntimeConfig = {
    projectPath,
    dataDir,
    stateDbPath: path.join(dataDir, "state.sqlite"),
    model: "deepseek-v4-flash",
    provider: null,
    shellEnabled: true,
    browserEnabled: false,
    permissionProfile: "dev",
  };
  new HookService(projectPath, dataDir).add({
    id: "block-write",
    event: "PreToolUse",
    matcher: "write_file",
    command: `node -e "console.log(JSON.stringify({decision:'block',reason:'no generated writes'}))"`,
  });
  const state = new StateStore(config.stateDbPath);
  const engine = new QueryEngine({
    config,
    state,
    provider: new HookBlockedProvider(),
    permissions: { allowShell: true, allowBrowser: false, profile: "custom" },
  });

  for await (const _event of engine.submit("write a blocked file")) {
    // Drain the generator.
  }

  assert.equal(fs.existsSync(path.join(projectPath, "blocked.txt")), false);
  assert.equal(state.listRuns(1)[0]?.status, "failed");
  const hookEvent = state.listEvents(undefined, 50).find((event) => event.kind === "hooks_executed");
  assert.equal((hookEvent?.payload as { blocked?: boolean } | undefined)?.blocked, true);
  state.close();
});

test("QueryEngine continues compact action batches until work is complete", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const provider = new BatchedProvider();
  const engine = new QueryEngine({
    config: {
      projectPath,
      dataDir,
      stateDbPath: path.join(dataDir, "state.sqlite"),
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    state,
    provider,
  });

  for await (const _event of engine.submit("create batched files")) {
    // Drain the generator.
  }

  assert.equal(fs.readFileSync(path.join(projectPath, "one.txt"), "utf8"), "one\n");
  assert.equal(fs.readFileSync(path.join(projectPath, "two.txt"), "utf8"), "two\n");
  assert.equal(state.listRuns(1)[0]?.status, "succeeded");
  assert.equal(state.listRuns(1)[0]?.actionCount, 2);
  assert.equal(provider.sawCreatedFileInPrompt, true);
  assert.ok(state.listEvents(undefined, 50).some((event) => event.kind === "action_batch_continue"));
  assert.ok(state.listEvents(undefined, 50).some((event) => event.kind === "context_bundle_refreshed"));
  state.close();
});

test("QueryEngine pauses when the model only enters plan mode", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const engine = new QueryEngine({
    config: {
      projectPath,
      dataDir,
      stateDbPath: path.join(dataDir, "state.sqlite"),
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    state,
    provider: new PlanOnlyProvider(),
  });

  const events = [];
  for await (const event of engine.submit("create a full app")) events.push(event);

  assert.equal(state.listRuns(1)[0]?.status, "paused");
  assert.ok(events.some((event) => event.type === "assistant" && event.text.includes("no implementation files")));
  assert.equal(fs.existsSync(path.join(projectPath, "index.html")), false);
  state.close();
});

test("QueryEngine remembers a local runtime failure for the next chat turn", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const provider = new FailureMemoryProvider();
  const engine = new QueryEngine({
    config: {
      projectPath,
      dataDir,
      stateDbPath: path.join(dataDir, "state.sqlite"),
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    state,
    provider,
  });

  for await (const _event of engine.submit("create a project")) {
    // Drain the generator.
  }
  const secondEvents = [];
  for await (const event of engine.submit("why did it fail")) secondEvents.push(event);

  assert.ok(provider.lastChatMessages.some((message) =>
    message.content.includes("Previous local run failed: DeepSeek JSON response invalid after retry")));
  assert.ok(secondEvents.some((event) => event.type === "assistant" && event.text.includes("remembered failure")));
  state.close();
});

test("QueryEngine does not accept read-only completion for file-change tasks", async () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-project-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseekcode-query-data-"));
  const state = new StateStore(path.join(dataDir, "state.sqlite"));
  const provider = new ReadOnlyThenWriteProvider();
  const engine = new QueryEngine({
    config: {
      projectPath,
      dataDir,
      stateDbPath: path.join(dataDir, "state.sqlite"),
      model: "deepseek-v4-flash",
      provider: null,
      shellEnabled: false,
      browserEnabled: false,
      permissionProfile: "safe",
    },
    state,
    provider,
  });

  for await (const _event of engine.submit("create a file")) {
    // Drain the generator.
  }

  assert.equal(provider.planCalls, 2);
  assert.equal(provider.sawToolTrajectory, true);
  assert.equal(fs.readFileSync(path.join(projectPath, "done.txt"), "utf8"), "done\n");
  assert.equal(state.listRuns(1)[0]?.status, "succeeded");
  assert.ok(state.listEvents(undefined, 50).some((event) => event.kind === "action_feedback_no_progress"));
  state.close();
});

class HookBlockedProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";

  async verifyModel(): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    yield { type: "text_delta", text: "ok" };
  }

  async classifyTurn(_input: string): Promise<TurnClassification> {
    return { task_kind: "file_change", needs_local_tools: true, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    return {
      task_kind: "file_change",
      needs_local_tools: true,
      acceptance_criteria: ["blocked.txt is not written"],
      final_message: "attempted write",
      actions: [
        {
          type: "write_file",
          path: "blocked.txt",
          content: "blocked\n",
          encoding: "utf-8",
          overwrite: false,
        },
      ],
    };
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }
}

class BatchedProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";
  private batch = 0;
  sawCreatedFileInPrompt = false;

  async verifyModel(): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    yield { type: "text_delta", text: "ok" };
  }

  async classifyTurn(_input: string): Promise<TurnClassification> {
    return { task_kind: "file_change", needs_local_tools: true, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
    trajectory?: Array<{ toolReport: ActionExecutionReport }>;
  }): Promise<ActionEnvelope> {
    this.batch += 1;
    if (this.batch === 1) {
      return {
        task_kind: "file_change",
        needs_local_tools: true,
        acceptance_criteria: ["both files exist"],
        final_message: "first batch complete",
        continue_work: true,
        remaining_work: "write the second file",
        actions: [
          { type: "write_file", path: "one.txt", content: "one\n", encoding: "utf-8", overwrite: true },
        ],
      };
    }
    this.sawCreatedFileInPrompt = _input.userMessage.includes("one.txt");
    return {
      task_kind: "file_change",
      needs_local_tools: true,
      acceptance_criteria: ["both files exist"],
      final_message: "second batch complete",
      actions: [
        { type: "write_file", path: "two.txt", content: "two\n", encoding: "utf-8", overwrite: true },
      ],
    };
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }
}

class PlanOnlyProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";

  async verifyModel(): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    yield { type: "text_delta", text: "ok" };
  }

  async classifyTurn(_input: string): Promise<TurnClassification> {
    return { task_kind: "file_change", needs_local_tools: true, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    return {
      task_kind: "file_change",
      needs_local_tools: true,
      acceptance_criteria: ["plan exists"],
      final_message: "planning",
      actions: [{ type: "EnterPlanMode", goal: "create the app" }],
    };
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }
}

class FailureMemoryProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";
  lastChatMessages: ChatMessage[] = [];

  async verifyModel(): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async *streamChat(messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    this.lastChatMessages = messages;
    yield { type: "text_delta", text: "remembered failure" };
  }

  async classifyTurn(input: string): Promise<TurnClassification> {
    return input.includes("why")
      ? { task_kind: "chat", needs_local_tools: false, reason: "follow-up" }
      : { task_kind: "file_change", needs_local_tools: true, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
  }): Promise<ActionEnvelope> {
    throw new Error("DeepSeek JSON response invalid after retry: action plan parse failed finish=length");
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }
}

class ReadOnlyThenWriteProvider implements DeepSeekProviderClient {
  providerName = "fake-deepseek";
  model = "deepseek-v4-flash";
  planCalls = 0;
  sawToolTrajectory = false;

  async verifyModel(): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async completeChat(_messages: ChatMessage[]): Promise<ChatReply> {
    return { provider: this.providerName, model: this.model, text: "ok" };
  }

  async *streamChat(_messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent, void, void> {
    yield { type: "text_delta", text: "ok" };
  }

  async classifyTurn(_input: string): Promise<TurnClassification> {
    return { task_kind: "file_change", needs_local_tools: true, reason: "fake" };
  }

  async planActions(_input: {
    userMessage: string;
    systemPrompt: string;
    contextSummary: string;
    feedback?: ActionExecutionReport;
    trajectory?: Array<{ toolReport: ActionExecutionReport }>;
  }): Promise<ActionEnvelope> {
    this.planCalls += 1;
    if (this.planCalls === 1) {
      return {
        task_kind: "file_change",
        needs_local_tools: true,
        acceptance_criteria: ["done.txt is created"],
        final_message: "done",
        actions: [{ type: "list_files", path: "", max_depth: 1 }],
      };
    }
    this.sawToolTrajectory = Boolean(_input.trajectory?.[0]?.toolReport.results.some((result) => result.action_type === "list_files"));
    return {
      task_kind: "file_change",
      needs_local_tools: true,
      acceptance_criteria: ["done.txt is created"],
      final_message: "done",
      actions: [
        { type: "write_file", path: "done.txt", content: "done\n", encoding: "utf-8", overwrite: true },
      ],
    };
  }

  takeLastUsage(): UsageSnapshot | undefined {
    return undefined;
  }
}
