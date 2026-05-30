import type { TerminalTone } from "../design/terminalTheme.js";

export type AgentSourceScope = "project" | "user" | "cache" | "plugin" | "built-in" | string;

export interface AgentComponentSummary {
  name: string;
  scope: AgentSourceScope;
  path: string;
  description: string;
  tools?: string[];
  model?: string;
  color?: string;
}

export interface AgentComponentRow {
  id: string;
  label: string;
  detail: string;
  description: string;
  tone: TerminalTone;
  selected: boolean;
  disabled: boolean;
}

export interface AgentMenuItem {
  id: string;
  label: string;
  command: string;
  detail: string;
  tone: TerminalTone;
}

export interface AgentDraft {
  name: string;
  description: string;
  model: string;
  color: string;
  tools: string[];
  prompt: string;
  maxTurns: number;
}
