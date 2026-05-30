export type ServiceAvailability = "implemented" | "local-adapter" | "not-applicable";

export interface ServiceCompatibilityInfo {
  referencePath: string;
  domain: string;
  localTarget: string;
  availability: ServiceAvailability;
  cloudOnly: boolean;
  note: string;
}

export interface ServiceAdapter {
  info: ServiceCompatibilityInfo;
  status(): ServiceCompatibilityInfo;
  unsupported(operation?: string): {
    status: "unsupported";
    referencePath: string;
    localTarget: string;
    message: string;
  };
}

const DOMAIN_TARGETS: Record<string, { target: string; availability: ServiceAvailability; cloudOnly?: boolean; note: string }> = {
  AgentSummary: {
    target: "src/services/agents",
    availability: "local-adapter",
    note: "Agent summaries are handled by DeepSeekCode local agent run services.",
  },
  MagicDocs: {
    target: "local artifact/document workflows",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Claude MagicDocs cloud flows are not copied; DeepSeekCode uses local artifact validation and docs tooling.",
  },
  PromptSuggestion: {
    target: "src/prompt/commandSuggestions.ts",
    availability: "implemented",
    note: "Prompt suggestions are handled by the local prompt suggestion and picker model.",
  },
  SessionMemory: {
    target: "src/services/session + src/memdir",
    availability: "local-adapter",
    note: "Session memory maps to local transcripts, metadata, and project memory.",
  },
  analytics: {
    target: "src/services/telemetry",
    availability: "local-adapter",
    cloudOnly: true,
    note: "Reference analytics calls are reduced to local/no-op telemetry for open-source DeepSeekCode builds.",
  },
  api: {
    target: "src/services/deepseek/client.ts",
    availability: "local-adapter",
    cloudOnly: true,
    note: "Claude API services map to the DeepSeek provider client or explicit local unsupported results.",
  },
  autoDream: {
    target: "local planning and cache workflows",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Claude auto-dream services are cloud-specific and are not copied into DeepSeekCode.",
  },
  compact: {
    target: "src/services/compact",
    availability: "implemented",
    note: "Compaction maps to DeepSeekCode rolling and session compact services.",
  },
  contextCollapse: {
    target: "src/services/compact + src/context",
    availability: "local-adapter",
    note: "Context collapse maps to cache-aware context bundling and local compaction.",
  },
  extractMemories: {
    target: "src/memdir/projectMemory.ts",
    availability: "local-adapter",
    note: "Memory extraction maps to local project memory surfaces.",
  },
  lsp: {
    target: "future local diagnostics service",
    availability: "not-applicable",
    note: "LSP background services are staged as paths until a local diagnostics worker is added.",
  },
  mcp: {
    target: "src/services/mcp/mcpService.ts",
    availability: "implemented",
    note: "MCP services map to DeepSeekCode local stdio/http MCP configuration and session pooling.",
  },
  oauth: {
    target: "local provider environment configuration",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Claude OAuth flows are not copied; DeepSeekCode uses local provider keys and config.",
  },
  plugins: {
    target: "src/services/plugins/pluginService.ts",
    availability: "implemented",
    note: "Plugin operations map to the local source-tracked plugin lifecycle.",
  },
  policyLimits: {
    target: "src/services/permissions",
    availability: "local-adapter",
    cloudOnly: true,
    note: "Remote policy limits map to local permission profiles and approval gates.",
  },
  remoteManagedSettings: {
    target: "src/services/config + src/services/theme",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Remote managed settings are not copied; DeepSeekCode keeps local settings explicit.",
  },
  settingsSync: {
    target: "src/services/config",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Settings sync is staged as local-only compatibility for open-source builds.",
  },
  skillSearch: {
    target: "src/services/skills/skillService.ts",
    availability: "local-adapter",
    note: "Remote skill search maps to local/project/user/cache skill discovery.",
  },
  teamMemorySync: {
    target: "src/memdir/projectMemory.ts",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Team memory sync is cloud-specific; DeepSeekCode keeps memory local unless plugins add sync.",
  },
  tips: {
    target: "local welcome/status panels",
    availability: "local-adapter",
    note: "Tips map to local onboarding and status notice surfaces.",
  },
  tools: {
    target: "src/services/tools/toolOrchestration.ts",
    availability: "implemented",
    note: "Tool execution services map to DeepSeekCode tool orchestration and hook bridge.",
  },
  toolUseSummary: {
    target: "src/components/ToolActivityGroup.tsx",
    availability: "local-adapter",
    note: "Tool-use summaries map to transcript activity grouping and local tool result details.",
  },
};

const ROOT_TARGETS: Record<string, { target: string; availability: ServiceAvailability; cloudOnly?: boolean; note: string }> = {
  awaySummary: {
    target: "src/services/session + src/services/compact",
    availability: "local-adapter",
    note: "Away summaries map to local transcript summaries and compact previews.",
  },
  claudeAiLimits: {
    target: "src/services/inference/inferenceSettingsService.ts",
    availability: "local-adapter",
    cloudOnly: true,
    note: "Claude limits map to DeepSeekCode inference budgets and explicit token caps.",
  },
  claudeAiLimitsHook: {
    target: "src/services/inference/inferenceSettingsService.ts",
    availability: "local-adapter",
    cloudOnly: true,
    note: "Claude limit hooks map to local budget notices.",
  },
  internalLogging: {
    target: "src/services/logging/runtimeLog.ts",
    availability: "implemented",
    note: "Internal logging maps to DeepSeekCode runtime logs.",
  },
  mcpServerApproval: {
    target: "src/services/mcp + src/services/approval",
    availability: "local-adapter",
    note: "MCP approval maps to local MCP sessions and durable approval gates.",
  },
  mockRateLimits: {
    target: "src/services/deepseek/client.ts",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Rate-limit mocking is not part of the local runtime.",
  },
  preventSleep: {
    target: "local process lifecycle",
    availability: "not-applicable",
    note: "Sleep-prevention hooks are intentionally absent in the terminal-first runtime.",
  },
  rateLimitMessages: {
    target: "src/components/RateLimitMessage.tsx",
    availability: "implemented",
    note: "Rate-limit messaging maps to DeepSeekCode provider error display.",
  },
  rateLimitMocking: {
    target: "src/services/deepseek/client.ts",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Rate-limit mocking is not copied from the reference.",
  },
  tokenEstimation: {
    target: "src/services/cache/resonixPolicy.ts",
    availability: "local-adapter",
    note: "Token estimation maps to cache planning and dynamic prompt budgeting.",
  },
  vcr: {
    target: "src/services/logging/runtimeLog.ts",
    availability: "not-applicable",
    cloudOnly: true,
    note: "Reference VCR fixtures are not part of the local open-source runtime.",
  },
  voice: {
    target: "future local voice plugin",
    availability: "not-applicable",
    note: "Voice services are path-staged until a local plugin-backed voice implementation is added.",
  },
  voiceKeyterms: {
    target: "future local voice plugin",
    availability: "not-applicable",
    note: "Voice keyterm services are path-staged for future plugin support.",
  },
  voiceStreamSTT: {
    target: "future local voice plugin",
    availability: "not-applicable",
    note: "Streaming speech-to-text is not bundled in the terminal-first runtime.",
  },
};

export function createServiceAdapter(referencePath: string): ServiceAdapter {
  const info = serviceCompatibilityInfo(referencePath);
  return {
    info,
    status() {
      return info;
    },
    unsupported(operation = "service call") {
      return serviceUnsupportedResult(referencePath, operation);
    },
  };
}

export function serviceCompatibilityInfo(referencePath: string): ServiceCompatibilityInfo {
  const normalized = normalizeServiceReference(referencePath);
  const domain = serviceDomain(normalized);
  const rootName = normalized.split("/").at(-1)?.replace(/\.(tsx?|jsx?)$/, "") ?? normalized;
  const match = DOMAIN_TARGETS[domain] ?? ROOT_TARGETS[rootName] ?? {
    target: "DeepSeekCode local runtime",
    availability: "local-adapter" as const,
    note: "Reference service path is staged as a DeepSeekCode-owned compatibility adapter.",
  };
  return {
    referencePath: normalized,
    domain,
    localTarget: match.target,
    availability: match.availability,
    cloudOnly: Boolean(match.cloudOnly),
    note: match.note,
  };
}

export function normalizeServiceReference(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function serviceDomain(referencePath: string): string {
  const normalized = normalizeServiceReference(referencePath);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length > 1) return parts[0] ?? normalized;
  return (parts[0] ?? normalized).replace(/\.(tsx?|jsx?)$/, "");
}

export function serviceUnsupportedResult(referencePath: string, operation = "service call") {
  const info = serviceCompatibilityInfo(referencePath);
  return {
    status: "unsupported" as const,
    referencePath: info.referencePath,
    localTarget: info.localTarget,
    message: `${operation} from ${info.referencePath} is present as a compatibility path. ${info.note}`,
  };
}

export default {
  createServiceAdapter,
  normalizeServiceReference,
  serviceCompatibilityInfo,
  serviceDomain,
  serviceUnsupportedResult,
};
