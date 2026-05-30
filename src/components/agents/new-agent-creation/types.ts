import type { SelectListOption } from "../../design/SelectList.js";
import type { AgentDraft } from "../types.js";

export type AgentCreationMethod = "manual" | "generate";
export type AgentCreationType = "general" | "reviewer" | "builder" | "tester" | "researcher";
export type AgentCreationLocation = "project" | "user";

export type AgentCreationStepId =
  | "method"
  | "type"
  | "location"
  | "description"
  | "prompt"
  | "tools"
  | "model"
  | "color"
  | "memory"
  | "generate"
  | "confirm";

export interface AgentCreationWizardState extends AgentDraft {
  method: AgentCreationMethod;
  type: AgentCreationType;
  location: AgentCreationLocation;
  goal: string;
  memory: boolean;
}

export interface AgentCreationStepDefinition {
  id: AgentCreationStepId;
  title: string;
  detail: string;
}

export interface AgentCreationStepModel {
  id: AgentCreationStepId;
  title: string;
  detail: string;
  ready: boolean;
  options?: SelectListOption[];
  rows?: Array<{ label: string; value: string }>;
  warnings?: string[];
}

export const AGENT_CREATION_STEPS: AgentCreationStepDefinition[] = [
  { id: "method", title: "Method", detail: "manual or generated setup" },
  { id: "type", title: "Type", detail: "agent behavior template" },
  { id: "location", title: "Location", detail: "project or user agent file" },
  { id: "description", title: "Description", detail: "routing summary" },
  { id: "prompt", title: "Prompt", detail: "stable system prompt" },
  { id: "tools", title: "Tools", detail: "tool allowlist" },
  { id: "model", title: "Model", detail: "agent model choice" },
  { id: "color", title: "Color", detail: "terminal identity" },
  { id: "memory", title: "Memory", detail: "whether to reference project memory" },
  { id: "generate", title: "Generate", detail: "cache-friendly draft" },
  { id: "confirm", title: "Confirm", detail: "validate and save" },
];

export function defaultAgentCreationState(goal = ""): AgentCreationWizardState {
  return {
    method: goal.trim() ? "generate" : "manual",
    type: "general",
    location: "project",
    goal,
    memory: true,
    name: "",
    description: "",
    model: "deepseek-v4-flash",
    color: "cyan",
    tools: [],
    prompt: "",
    maxTurns: 3,
  };
}
