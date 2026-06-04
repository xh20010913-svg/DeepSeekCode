import type { Command } from "../../types/command.js";
import { answerAsyncQuestion } from "../../services/async/asyncQuestionService.js";

export const askCommand: Command = {
  name: "ask",
  description: "Ask a read-only side question about the current project or latest run without starting local tool work.",
  usage: "<question>",
  async execute(args, context) {
    const question = args.trim();
    if (!question) return { message: "Usage: /ask <question>" };
    if (!context.provider) {
      return { message: "DeepSeek provider is not configured. Set DEEPSEEK_API_KEY first." };
    }
    const latest = context.state.listRuns(1)[0];
    const result = await answerAsyncQuestion({
      question,
      config: context.config,
      state: context.state,
      provider: context.provider,
      runId: latest?.id,
    });
    if (result.usage) {
      context.recordUsageEvent?.(result.usage);
      if (latest) context.state.recordUsage(latest.id, result.usage, "async_ask");
    }
    context.state.appendEvent(latest?.id ?? null, "async_question_answered", {
      question,
      answer_chars: result.answer.length,
    });
    return { message: result.answer };
  },
};
