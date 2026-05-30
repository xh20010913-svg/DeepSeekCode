export type ReviewMode = "code" | "security";

export interface ReviewPromptInput {
  mode: ReviewMode;
  diff: string;
  source: string;
  focus?: string;
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const shared = [
    "Review the following local changes for DeepSeekCode.",
    `Diff source: ${input.source}`,
    input.focus ? `User focus: ${input.focus}` : "",
    "Prioritize concrete, actionable findings over style commentary.",
    "Use file paths and line references when possible.",
    "If there are no material issues, say that clearly and mention residual test risk.",
  ].filter(Boolean);

  if (input.mode === "security") {
    return [
      "You are a senior security reviewer.",
      ...shared,
      "Only report high-confidence vulnerabilities introduced by this diff.",
      "Ignore theoretical issues, denial-of-service-only concerns, generic hardening advice, and documentation-only changes.",
      "For each finding include severity, category, exploit scenario, confidence, and a fix recommendation.",
      "",
      "```diff",
      input.diff,
      "```",
    ].join("\n");
  }

  return [
    "You are an expert code reviewer.",
    ...shared,
    "Focus on correctness, regressions, missing tests, maintainability, and project conventions.",
    "Lead with findings ordered by severity, then open questions, then a brief summary.",
    "",
    "```diff",
    input.diff,
    "```",
  ].join("\n");
}
