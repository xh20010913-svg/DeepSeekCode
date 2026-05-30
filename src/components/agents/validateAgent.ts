import type { AgentValidationResult } from "../../agents/manifest.js";
import type { TerminalTone } from "../design/terminalTheme.js";
import type { AgentDraft } from "./types.js";
import { normalizeAgentComponentName } from "./utils.js";

export interface AgentValidationSummary {
  label: string;
  tone: TerminalTone;
  messages: string[];
}

export interface AgentDraftValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function agentValidationSummary(result: AgentValidationResult): AgentValidationSummary {
  if (result.errors.length > 0) {
    return {
      label: "invalid",
      tone: "error",
      messages: result.errors,
    };
  }
  if (result.warnings.length > 0) {
    return {
      label: "warning",
      tone: "warning",
      messages: result.warnings,
    };
  }
  return {
    label: result.ok ? "ready" : "invalid",
    tone: result.ok ? "success" : "error",
    messages: result.ok ? ["agent manifest is valid"] : ["agent manifest is invalid"],
  };
}

export function validateAgentDraft(draft: AgentDraft): AgentDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedName = normalizeAgentComponentName(draft.name);
  if (!normalizedName) errors.push("agent name is required");
  if (draft.name.trim() && normalizedName !== draft.name.trim()) {
    warnings.push(`agent name will be saved as '${normalizedName}'`);
  }
  if (!draft.prompt.trim()) errors.push("agent prompt is required");
  if (!draft.description.trim()) warnings.push("description helps route tasks to this agent");
  if (!draft.tools.length) warnings.push("no tools selected; the agent will inherit all allowed tools");
  if (!Number.isFinite(draft.maxTurns) || draft.maxTurns < 1) errors.push("max turns must be positive");
  return { ok: errors.length === 0, errors, warnings };
}
