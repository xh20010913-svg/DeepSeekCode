export type UtilityAvailability = "implemented" | "local-adapter" | "not-applicable";

export interface UtilityCompatibilityInfo {
  referencePath: string;
  family: string;
  localTarget: string;
  availability: UtilityAvailability;
  note: string;
}

export interface UtilityAdapter {
  info: UtilityCompatibilityInfo;
  status(): UtilityCompatibilityInfo;
  unavailable(operation?: string): {
    status: "unavailable";
    referencePath: string;
    localTarget: string;
    message: string;
  };
}

const UTILITY_FAMILY_TARGETS: Record<string, { target: string; availability: UtilityAvailability; note: string }> = {
  auth: {
    target: "local provider environment configuration",
    availability: "not-applicable",
    note: "Claude auth helpers are not copied; DeepSeekCode uses local provider keys and explicit config.",
  },
  browser: {
    target: "src/bridge + src/services/browser",
    availability: "local-adapter",
    note: "Browser helpers map to local CDP/session/trajectory utilities.",
  },
  cache: {
    target: "src/services/cache",
    availability: "implemented",
    note: "Cache helpers map to Resonix-style prompt planning and cache diagnostics.",
  },
  claude: {
    target: "DeepSeekCode local runtime",
    availability: "not-applicable",
    note: "Claude-branded helpers are staged only as compatibility paths.",
  },
  config: {
    target: "src/services/config",
    availability: "local-adapter",
    note: "Configuration helpers map to local DeepSeekCode config services.",
  },
  context: {
    target: "src/context",
    availability: "implemented",
    note: "Context helpers map to repository maps and cache-aware context bundles.",
  },
  cron: {
    target: "future local automation worker",
    availability: "not-applicable",
    note: "Reference cron utilities are staged until DeepSeekCode adds a durable automation worker.",
  },
  diff: {
    target: "src/utils/diff.ts",
    availability: "implemented",
    note: "Diff helpers map to DeepSeekCode unified diff parsing and display models.",
  },
  env: {
    target: "src/utils/envUtils.ts",
    availability: "implemented",
    note: "Environment helpers map to DeepSeekCode env utilities and provider config.",
  },
  file: {
    target: "src/utils/fileStateCache.ts",
    availability: "local-adapter",
    note: "File helpers map to safe local filesystem and read-before-write utilities.",
  },
  fs: {
    target: "local filesystem tools",
    availability: "local-adapter",
    note: "Filesystem helpers map to DeepSeekCode local tools and file state cache.",
  },
  git: {
    target: "src/services/status + src/commands/builtin/diff.ts",
    availability: "local-adapter",
    note: "Git helpers map to local status, branch, and diff command surfaces.",
  },
  hook: {
    target: "src/services/hooks",
    availability: "local-adapter",
    note: "Hook helpers map to the local hook service and tool-event bridge.",
  },
  markdown: {
    target: "src/components/Markdown.tsx",
    availability: "local-adapter",
    note: "Markdown helpers map to terminal-safe Markdown rendering.",
  },
  mcp: {
    target: "src/mcp + src/services/mcp",
    availability: "implemented",
    note: "MCP helpers map to local MCP config, transports, and session pooling.",
  },
  message: {
    target: "src/components/messages + src/types/messages.ts",
    availability: "local-adapter",
    note: "Message helpers map to DeepSeekCode transcript and message rendering models.",
  },
  model: {
    target: "src/services/model + src/services/inference",
    availability: "local-adapter",
    note: "Model helpers map to DeepSeek model and inference budget services.",
  },
  permission: {
    target: "src/services/permissions + src/services/approval",
    availability: "implemented",
    note: "Permission helpers map to local profiles and durable approval gates.",
  },
  plugin: {
    target: "src/services/plugins",
    availability: "implemented",
    note: "Plugin helpers map to the local source-tracked plugin lifecycle.",
  },
  prompt: {
    target: "src/prompt + src/query",
    availability: "local-adapter",
    note: "Prompt helpers map to local prompt editing, suggestions, and cache-aware query planning.",
  },
  remote: {
    target: "src/services/remote + src/ssh",
    availability: "local-adapter",
    note: "Remote helpers map to local SSH profiles, sessions, and queue workers.",
  },
  session: {
    target: "src/services/session",
    availability: "implemented",
    note: "Session helpers map to local transcript persistence and metadata.",
  },
  skill: {
    target: "src/services/skills + src/skills",
    availability: "implemented",
    note: "Skill helpers map to local/project/user/cache skill services.",
  },
  telemetry: {
    target: "src/services/telemetry + src/services/logging",
    availability: "local-adapter",
    note: "Telemetry helpers map to local logs and no-op-safe event records.",
  },
  token: {
    target: "src/services/cache/resonixPolicy.ts",
    availability: "local-adapter",
    note: "Token helpers map to cache planning and prompt budget estimates.",
  },
  tool: {
    target: "src/tools + src/services/tools",
    availability: "implemented",
    note: "Tool helpers map to local tool registry, executor, hooks, and orchestration.",
  },
  updater: {
    target: "manual release workflow",
    availability: "not-applicable",
    note: "Auto-updater helpers are not bundled in this open-source terminal runtime.",
  },
};

export function createUtilityAdapter(referencePath: string): UtilityAdapter {
  const info = utilityCompatibilityInfo(referencePath);
  return {
    info,
    status() {
      return info;
    },
    unavailable(operation = "utility call") {
      return utilityUnavailableResult(referencePath, operation);
    },
  };
}

export function utilityCompatibilityInfo(referencePath: string): UtilityCompatibilityInfo {
  const normalized = normalizeUtilityReference(referencePath);
  const family = utilityFamily(normalized);
  const match = targetForFamily(family);
  return {
    referencePath: normalized,
    family,
    localTarget: match.target,
    availability: match.availability,
    note: match.note,
  };
}

export function normalizeUtilityReference(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function utilityFamily(referencePath: string): string {
  const normalized = normalizeUtilityReference(referencePath);
  const first = normalized.split("/").filter(Boolean)[0] ?? normalized;
  const stem = first.replace(/\.(tsx?|jsx?)$/, "");
  const lower = stem.toLowerCase();
  for (const key of Object.keys(UTILITY_FAMILY_TARGETS)) {
    if (lower === key || lower.startsWith(key)) return key;
  }
  return lower;
}

export function utilityUnavailableResult(referencePath: string, operation = "utility call") {
  const info = utilityCompatibilityInfo(referencePath);
  return {
    status: "unavailable" as const,
    referencePath: info.referencePath,
    localTarget: info.localTarget,
    message: `${operation} from ${info.referencePath} is present as a compatibility path. ${info.note}`,
  };
}

export function identity<T>(value: T): T {
  return value;
}

export function noop(): void {
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function truncateText(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function targetForFamily(family: string): { target: string; availability: UtilityAvailability; note: string } {
  return UTILITY_FAMILY_TARGETS[family] ?? {
    target: "DeepSeekCode local runtime",
    availability: "local-adapter",
    note: "Reference utility path is staged as a DeepSeekCode-owned compatibility adapter.",
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

export default {
  asArray,
  createUtilityAdapter,
  identity,
  isRecord,
  noop,
  normalizeUtilityReference,
  safeJsonParse,
  sleep,
  stableStringify,
  truncateText,
  utilityCompatibilityInfo,
  utilityFamily,
  utilityUnavailableResult,
};
