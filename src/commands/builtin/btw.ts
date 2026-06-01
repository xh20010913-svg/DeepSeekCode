import type { Command } from "../../types/command.js";
import { cachePlanSummary } from "../../services/cache/resonixPolicy.js";
import { runSideQuestion } from "../../services/sideQuestion/sideQuestionService.js";

export const btwCommand: Command = {
  name: "btw",
  description: "Ask a quick side question without interrupting the main conversation.",
  usage: "<question>",
  async execute(args, context) {
    const question = args.trim();
    if (!question) return { message: "Usage: /btw <question>" };
    if (!context.provider) {
      return {
        message:
          "Provider missing. Set DEEPSEEK_API_KEY in the project .env, then run /doctor.",
      };
    }

    const result = await runSideQuestion({
      question,
      projectPath: context.config.projectPath,
      dataDir: context.config.dataDir,
      model: context.config.model,
      provider: context.provider,
      state: context.state,
    });
    const usage = result.usage
      ? [
          `input=${result.usage.inputTokens ?? 0}`,
          `output=${result.usage.outputTokens ?? 0}`,
          `cacheHit=${result.usage.cacheHitTokens ?? 0}`,
          `cacheMiss=${result.usage.cacheMissTokens ?? 0}`,
        ].join(" ")
      : "usage=n/a";

    return {
      message: [
        `/btw ${question}`,
        "",
        result.answer,
        "",
        [
          `contextFiles=${result.selectedFiles}`,
          cachePlanSummary(result.plan),
          usage,
        ].join(" "),
      ].join("\n"),
    };
  },
};
