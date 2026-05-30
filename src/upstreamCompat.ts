export type SourceAvailability = "implemented" | "local-adapter" | "not-applicable";

export interface SourceCompatibilityInfo {
  referencePath: string;
  moduleName: string;
  localTarget: string;
  availability: SourceAvailability;
  note: string;
}

export interface SourceAdapter {
  info: SourceCompatibilityInfo;
  status(): SourceCompatibilityInfo;
  unavailable(operation?: string): {
    status: "unavailable";
    referencePath: string;
    localTarget: string;
    message: string;
  };
}

const MODULE_TARGETS: Record<string, { target: string; availability: SourceAvailability; note: string }> = {
  assistant: {
    target: "src/services/session + src/commands/builtin/resume.ts",
    availability: "local-adapter",
    note: "Assistant session discovery maps to local transcript/session metadata.",
  },
  bootstrap: {
    target: "src/state/store.ts",
    availability: "implemented",
    note: "Bootstrap state maps to DeepSeekCode local state initialization.",
  },
  bridge: {
    target: "src/bridge + src/services/browser",
    availability: "local-adapter",
    note: "Bridge paths map to local browser/CDP/session bridge services where applicable.",
  },
  buddy: {
    target: "local terminal notices",
    availability: "not-applicable",
    note: "Claude companion UI is not copied; DeepSeekCode keeps terminal notices local and minimal.",
  },
  cli: {
    target: "src/cli/main.tsx",
    availability: "local-adapter",
    note: "CLI handlers map to the DeepSeekCode terminal entrypoint and slash-command runtime.",
  },
  constants: {
    target: "src/constants + local services",
    availability: "local-adapter",
    note: "Reference constants are staged as compatibility paths while DeepSeekCode owns provider-specific values.",
  },
  context: {
    target: "src/context + src/components/Workbench.tsx",
    availability: "local-adapter",
    note: "React context paths map to the local workbench, prompt queue, and context bundle state.",
  },
  coordinator: {
    target: "src/services/agents + src/tasks",
    availability: "local-adapter",
    note: "Coordinator paths map to durable local agent runs and task queues.",
  },
  entrypoints: {
    target: "src/cli/main.tsx + src/server",
    availability: "local-adapter",
    note: "Reference entrypoints map to DeepSeekCode CLI and local server surfaces.",
  },
  jobs: {
    target: "local review and validation commands",
    availability: "not-applicable",
    note: "Background classifier jobs are staged until local workers require them.",
  },
  memdir: {
    target: "src/memdir/projectMemory.ts",
    availability: "implemented",
    note: "Memory directory helpers map to local project memory.",
  },
  migrations: {
    target: "src/services/config",
    availability: "local-adapter",
    note: "Reference migrations are staged; DeepSeekCode config migrations should be explicit and local.",
  },
  moreright: {
    target: "src/components/design",
    availability: "not-applicable",
    note: "Layout-specific reference hook is staged for future UI polish.",
  },
  "native-ts": {
    target: "installed dependencies or local terminal helpers",
    availability: "not-applicable",
    note: "Native reference packages are not copied into the TypeScript runtime.",
  },
  outputStyles: {
    target: "src/services/outputStyles/outputStyleService.ts",
    availability: "implemented",
    note: "Output style loading maps to local/project style services.",
  },
  plugins: {
    target: "src/services/plugins/pluginService.ts",
    availability: "implemented",
    note: "Plugin helpers map to local source-tracked plugin lifecycle.",
  },
  proactive: {
    target: "local status notices",
    availability: "not-applicable",
    note: "Proactive cloud suggestions are staged as local-safe compatibility only.",
  },
  query: {
    target: "src/query",
    availability: "implemented",
    note: "Query paths map to DeepSeekCode prompt/cache/action planning.",
  },
  remote: {
    target: "src/services/remote + src/ssh",
    availability: "local-adapter",
    note: "Remote paths map to SSH profiles, remote task workers, and local permission gates.",
  },
  schemas: {
    target: "src/types + src/hooks/config.ts",
    availability: "local-adapter",
    note: "Schemas map to local validation helpers and TypeScript types.",
  },
  server: {
    target: "src/server",
    availability: "local-adapter",
    note: "Server paths are staged for local direct-connect/server surfaces.",
  },
  state: {
    target: "src/state",
    availability: "implemented",
    note: "State paths map to local state store, app state, and SQLite persistence.",
  },
  tasks: {
    target: "src/tasks + src/services/agents",
    availability: "local-adapter",
    note: "Task paths map to durable local queues, agents, shell tasks, and workers.",
  },
  upstreamproxy: {
    target: "local provider/client adapters",
    availability: "not-applicable",
    note: "Upstream proxy paths are not copied; DeepSeekCode talks to configured providers directly.",
  },
  vim: {
    target: "src/components/VimTextInput.tsx",
    availability: "local-adapter",
    note: "Vim paths map to the staged terminal input mode helpers.",
  },
  voice: {
    target: "future local voice plugin",
    availability: "not-applicable",
    note: "Voice mode is path-staged until plugin-backed local voice support exists.",
  },
};

export function createSourceAdapter(referencePath: string): SourceAdapter {
  const info = sourceCompatibilityInfo(referencePath);
  return {
    info,
    status() {
      return info;
    },
    unavailable(operation = "source call") {
      return sourceUnavailableResult(referencePath, operation);
    },
  };
}

export function sourceCompatibilityInfo(referencePath: string): SourceCompatibilityInfo {
  const normalized = normalizeSourceReference(referencePath);
  const moduleName = sourceModuleName(normalized);
  const match = MODULE_TARGETS[moduleName] ?? {
    target: "DeepSeekCode local runtime",
    availability: "local-adapter" as const,
    note: "Reference path is staged as a DeepSeekCode-owned compatibility adapter.",
  };
  return {
    referencePath: normalized,
    moduleName,
    localTarget: match.target,
    availability: match.availability,
    note: match.note,
  };
}

export function normalizeSourceReference(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function sourceModuleName(referencePath: string): string {
  return normalizeSourceReference(referencePath).split("/").filter(Boolean)[0] ?? referencePath;
}

export function sourceUnavailableResult(referencePath: string, operation = "source call") {
  const info = sourceCompatibilityInfo(referencePath);
  return {
    status: "unavailable" as const,
    referencePath: info.referencePath,
    localTarget: info.localTarget,
    message: `${operation} from ${info.referencePath} is present as a compatibility path. ${info.note}`,
  };
}

export default {
  createSourceAdapter,
  normalizeSourceReference,
  sourceCompatibilityInfo,
  sourceModuleName,
  sourceUnavailableResult,
};
