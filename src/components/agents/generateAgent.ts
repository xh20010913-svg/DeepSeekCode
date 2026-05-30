import type { AgentDraft } from "./types.js";
import { normalizeAgentComponentName } from "./utils.js";

export function generateAgentMarkdown(draft: AgentDraft): string {
  const name = normalizeAgentComponentName(draft.name) || "agent";
  const description = draft.description.trim() || "DeepSeekCode custom agent.";
  const lines = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `model: ${draft.model.trim() || "inherit"}`,
  ];
  if (draft.tools.length > 0) lines.push(`tools: ${draft.tools.map(normalizeAgentComponentName).filter(Boolean).join(", ")}`);
  if (draft.color.trim()) lines.push(`color: ${draft.color.trim().toLowerCase()}`);
  if (draft.maxTurns > 0) lines.push(`max-turns: ${Math.floor(draft.maxTurns)}`);
  lines.push("---", "", agentPromptBody(draft, name), "");
  return lines.join("\n");
}

export function agentPromptBody(draft: Pick<AgentDraft, "prompt" | "description">, normalizedName: string): string {
  const prompt = draft.prompt.trim();
  if (prompt) return prompt;
  return [
    `You are the ${normalizedName} agent for DeepSeekCode.`,
    "",
    `Mission: ${draft.description.trim() || "Handle delegated coding tasks."}`,
    "",
    "Cache discipline:",
    "1. Keep stable instructions near the top of the prompt.",
    "2. Avoid repeating large project context unless the parent task requires it.",
    "3. Return concise evidence, changed files, and next actions.",
  ].join("\n");
}
