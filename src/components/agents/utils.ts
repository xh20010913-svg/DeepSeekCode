import type { AgentSummary } from "../../agents/discovery.js";
import { normalizeAgentName as normalizeManifestAgentName } from "../../agents/manifest.js";
import type { TerminalTone } from "../design/terminalTheme.js";
import { truncateCells } from "../design/textLayout.js";
import type { AgentSourceScope } from "./types.js";

export function normalizeAgentComponentName(value: string): string {
  return normalizeManifestAgentName(value);
}

export function agentScopeTone(scope: AgentSourceScope): TerminalTone {
  if (scope === "project") return "success";
  if (scope === "user") return "brand";
  if (scope === "plugin") return "warning";
  if (scope === "cache" || scope === "built-in") return "muted";
  return "default";
}

export function agentScopeLabel(scope: AgentSourceScope): string {
  if (scope === "project") return "project";
  if (scope === "user") return "user";
  if (scope === "plugin") return "plugin";
  if (scope === "cache") return "cache";
  if (scope === "built-in") return "built-in";
  return scope || "agent";
}

export function agentDisplayName(agent: Pick<AgentSummary, "name" | "scope">): string {
  const scope = agentScopeLabel(agent.scope);
  return `${agent.name} (${scope})`;
}

export function agentRowId(agent: Pick<AgentSummary, "name" | "scope">): string {
  return `${agent.scope}:${agent.name}`;
}

export function summarizeAgentTools(tools: readonly string[] | undefined, max = 4): string {
  if (!tools?.length) return "all tools";
  const visible = tools.slice(0, max);
  const suffix = tools.length > visible.length ? ` +${tools.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

export function compactAgentDescription(value: string | undefined, width = 88): string {
  const compact = (value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return compact ? truncateCells(compact, width) : "No description";
}
