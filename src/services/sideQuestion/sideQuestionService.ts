import crypto from "node:crypto";
import { recordUsageSnapshot } from "../../cost-tracker.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import { readProjectMemory } from "../../memdir/projectMemory.js";
import type { ChatMessage, DeepSeekProviderClient, UsageSnapshot } from "../../protocol/provider.js";
import { approximateTokens } from "../../query/promptCache.js";
import type { StateStore } from "../../state/sqlite.js";
import { CachePinService } from "../cache/cachePins.js";
import { buildResonixPromptPlan, type CachePromptPlan } from "../cache/resonixPolicy.js";
import { InferenceSettingsService } from "../inference/inferenceSettingsService.js";
import { OutputStyleService } from "../outputStyles/outputStyleService.js";
import { buildRequestDiagnostics } from "../telemetry/requestDiagnostics.js";

export interface SideQuestionInput {
  question: string;
  projectPath: string;
  dataDir: string;
  model: string;
  provider: DeepSeekProviderClient;
  state: StateStore;
}

export interface SideQuestionResult {
  runId: string;
  answer: string;
  usage?: UsageSnapshot;
  plan: CachePromptPlan;
  selectedFiles: number;
  stablePrefixHash: string;
}

const SIDE_QUESTION_REMINDER = [
  "<system-reminder>",
  "This is a one-off /btw side question from the user.",
  "Answer directly without tools, file writes, shell commands, browser use, or follow-up turns.",
  "The main coding conversation is not interrupted; do not mention resuming or switching tasks.",
  "Use only the supplied project context and general knowledge. If the context is insufficient, say what is unknown.",
  "</system-reminder>",
].join("\n");

export async function runSideQuestion(input: SideQuestionInput): Promise<SideQuestionResult> {
  const question = input.question.trim();
  if (!question) throw new Error("question is empty");

  const runId = input.state.createRun({
    projectPath: input.projectPath,
    model: input.provider.model || input.model,
    message: `side question: ${question}`,
  });

  try {
    const inference = new InferenceSettingsService(input.projectPath).effective();
    const contextBundle = buildContextBundle(input.projectPath, inference.sideQuestionContextChars, question);
    const projectMemory = readProjectMemory(input.projectPath);
    const stableSystemPrompt = buildSideQuestionSystemPrompt(input.projectPath, input.dataDir);
    const stablePrefixHash = shortSha256(stableSystemPrompt);
    const stableApproxTokens = approximateTokens(stableSystemPrompt);
    const plan = buildResonixPromptPlan([
      ...new CachePinService(input.projectPath).promptBlocks(),
      { title: "project_memory", body: projectMemory || "(empty)", priority: "project" },
      {
        title: "project_repository_map",
        body: contextBundle.repositoryMap.files.map((file) => `${file.path} (${file.size} bytes)`).join("\n"),
        priority: "project",
      },
      { title: "selected_context", body: contextBundlePrompt(contextBundle), priority: "context" },
      { title: "side_question", body: question, priority: "request" },
    ], { maxDynamicChars: inference.sideQuestionDynamicChars });

    input.state.saveContextSnapshot(runId, "side_question_context_bundle_v1", {
      repositoryMap: contextBundle.repositoryMap,
      selectedFiles: contextBundle.selectedFiles.map((file) => ({
        path: file.path,
        chars: file.content.length,
        truncated: file.truncated,
        score: file.score,
      })),
      approxTokens: contextBundle.approxTokens,
    });
    input.state.appendEvent(runId, "stable_prompt_prepared", {
      hash: stablePrefixHash,
      approx_tokens: stableApproxTokens,
      prefix_stable: true,
      mode: "side_question",
    });
    input.state.appendEvent(runId, "cache_prompt_plan", {
      mode: "side_question",
      effort: inference.effort,
      approx_tokens: plan.approxTokens,
      dropped_chars: plan.droppedChars,
      blocks: plan.blocks,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: stableSystemPrompt },
      {
        role: "user",
        content: [
          SIDE_QUESTION_REMINDER,
          plan.userMessage,
        ].join("\n"),
      },
    ];
    input.state.appendEvent(runId, "provider_request_diagnostics", buildRequestDiagnostics({
      provider: input.provider.providerName,
      model: input.provider.model,
      kind: "side_question",
      systemText: stableSystemPrompt,
      userText: plan.userMessage,
      stablePrefixHash,
    }));

    const reply = await input.provider.completeChat(messages);
    const usage = usageWithValues(input.provider.takeLastUsage()) ?? usageWithValues(reply);
    if (usage) {
      input.state.recordUsage(runId, usage, "side_question");
      recordUsageSnapshot(usage);
    }
    const answer = reply.text.trim() || "(no response received)";
    input.state.appendEvent(runId, "side_question_answered", {
      answer_chars: answer.length,
      selected_files: contextBundle.selectedFiles.length,
      approx_prompt_tokens: plan.approxTokens + stableApproxTokens,
      cache_blocks: plan.blocks.map((block) => block.title),
    });
    input.state.updateRunStatus(runId, "succeeded", "side question answered");

    return {
      runId,
      answer,
      usage,
      plan,
      selectedFiles: contextBundle.selectedFiles.length,
      stablePrefixHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.state.updateRunStatus(runId, "failed", message);
    input.state.appendEvent(runId, "side_question_failed", { message });
    throw error;
  }
}

function buildSideQuestionSystemPrompt(projectPath: string, dataDir: string): string {
  const outputStyle = new OutputStyleService(projectPath, dataDir).current().prompt;
  return [
    "You are DeepSeekCode, a Chinese-first local coding assistant. " +
      "Answer normal chat directly. Do not claim local files were changed unless the tool runtime changed them.",
    "",
    `<output_style>\n${outputStyle}\n</output_style>`,
  ].join("\n");
}

function shortSha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function usageWithValues(usage: UsageSnapshot | undefined): UsageSnapshot | undefined {
  if (!usage) return undefined;
  const hasAnyValue = [
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheHitTokens,
    usage.cacheMissTokens,
  ].some((value) => value !== undefined);
  return hasAnyValue ? usage : undefined;
}
