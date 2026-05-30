import type { TerminalTone } from "../design/terminalTheme.js";

export interface McpServerInfo {
  name: string;
  type?: string;
  status?: string;
  tools?: number;
  prompts?: number;
  resources?: number;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
  input_schema?: unknown;
  readOnly?: boolean;
  destructive?: boolean;
  openWorld?: boolean;
}

export interface McpWarningInfo {
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
}

export interface McpToneLabel {
  label: string;
  tone: TerminalTone;
}
