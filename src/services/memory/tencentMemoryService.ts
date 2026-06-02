import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import type { ChatMessage, DeepSeekProviderClient, ProviderConfig } from "../../protocol/provider.js";
import type { StateStore } from "../../state/sqlite.js";

type HookName = "before_prompt_build" | "before_message_write" | "agent_end" | "gateway_stop";
type HookHandler = (event: Record<string, unknown>, context: TencentHookContext) => unknown | Promise<unknown>;

interface TencentHookContext {
  sessionKey: string;
  sessionId: string;
  agentName?: string;
}

interface TencentToolRegistration {
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
}

export interface TencentMemoryRecall {
  prependContext?: string;
  appendSystemContext?: string;
  recalledL1Memories?: Array<{ content: string; score: number; type: string }>;
  recalledL3Persona?: string | null;
  recallStrategy?: string;
}

export interface TencentMemoryStatus {
  enabled: boolean;
  initialized: boolean;
  dataDir: string;
  vendor: string;
  tools: string[];
  error?: string;
  config: {
    capture: boolean;
    recall: boolean;
    extraction: boolean;
    storeBackend: "sqlite" | "tcvdb";
    embeddingProvider: string;
  };
}

export interface TencentMemorySearchResult {
  text: string;
  details?: unknown;
}

const services = new Map<string, TencentMemoryService>();

export function getTencentMemoryService(
  config: RuntimeConfig,
  provider: DeepSeekProviderClient | null,
  state?: StateStore,
): TencentMemoryService {
  const key = `${config.dataDir}|${config.projectPath}|${provider?.model ?? "none"}`;
  let service = services.get(key);
  if (!service) {
    service = new TencentMemoryService(config, provider?.model ?? config.model, (provider ? providerConfigFromClient(provider) : null) ?? config.provider, state);
    services.set(key, service);
  }
  return service;
}

function providerConfigFromClient(provider: DeepSeekProviderClient): ProviderConfig | null {
  const maybe = provider as DeepSeekProviderClient & { config?: ProviderConfig };
  return maybe.config ?? null;
}

export class TencentMemoryService {
  private readonly config: RuntimeConfig;
  private readonly model: string;
  private readonly providerConfig: ProviderConfig | null;
  private readonly state?: StateStore;
  private readonly hooks = new Map<HookName, HookHandler[]>();
  private readonly tools = new Map<string, TencentToolRegistration>();
  private initialized = false;
  private disabledReason = "";
  private initializing?: Promise<void>;

  constructor(
    config: RuntimeConfig,
    model: string,
    providerConfig: ProviderConfig | null,
    state?: StateStore,
  ) {
    this.config = config;
    this.model = model;
    this.providerConfig = providerConfig;
    this.state = state;
  }

  get status(): TencentMemoryStatus {
    const cfg = this.memoryPluginConfig();
    const capture = cfg.capture as { enabled?: boolean } | undefined;
    const recall = cfg.recall as { enabled?: boolean } | undefined;
    const extraction = cfg.extraction as { enabled?: boolean } | undefined;
    const embedding = cfg.embedding as { provider?: string } | undefined;
    return {
      enabled: this.isEnabled(),
      initialized: this.initialized,
      dataDir: this.pluginStateDir(),
      vendor: "TencentDB-Agent-Memory 0.3.6 (MIT, vendored dist)",
      tools: [...this.tools.keys()].sort(),
      error: this.disabledReason || undefined,
      config: {
        capture: Boolean(capture?.enabled),
        recall: Boolean(recall?.enabled),
        extraction: Boolean(extraction?.enabled),
        storeBackend: cfg.storeBackend as "sqlite" | "tcvdb",
        embeddingProvider: String(embedding?.provider ?? "none"),
      },
    };
  }

  async recall(userText: string, history: ChatMessage[], runId?: string): Promise<TencentMemoryRecall | undefined> {
    if (!this.isEnabled()) return undefined;
    await this.ensureInitialized(runId);
    if (!this.initialized) return undefined;
    const event = {
      prompt: userText,
      messages: history.map((message, index) => ({
        id: `history_${index}`,
        role: message.role,
        content: message.content,
        timestamp: Date.now() - (history.length - index + 1),
      })),
    };
    const result = await this.runHooks("before_prompt_build", event, this.hookContext());
    return isRecallResult(result) ? result : undefined;
  }

  async initialize(runId?: string): Promise<void> {
    await this.ensureInitialized(runId);
  }

  async captureTurn(input: {
    userText: string;
    assistantText: string;
    runId?: string;
    success: boolean;
  }): Promise<unknown | undefined> {
    if (!this.isEnabled()) return undefined;
    await this.ensureInitialized(input.runId);
    if (!this.initialized) return undefined;
    const now = Date.now();
    const event = {
      success: input.success,
      messages: [
        {
          id: `user_${now}`,
          role: "user",
          content: input.userText,
          timestamp: now,
        },
        {
          id: `assistant_${now}`,
          role: "assistant",
          content: input.assistantText,
          timestamp: now + 1,
        },
      ],
    };
    return this.runHooks("agent_end", event, this.hookContext());
  }

  async searchMemory(params: {
    query: string;
    limit?: number;
    memoryType?: string;
    scene?: string;
  }): Promise<TencentMemorySearchResult> {
    await this.ensureInitialized();
    const tool = this.tools.get("tdai_memory_search");
    if (!tool) throw new Error("tdai_memory_search is not available; TencentDB-Agent-Memory is disabled or not initialized.");
    return this.normalizeToolResult(await tool.execute("deepseekcode_memory_search", {
      query: params.query,
      limit: params.limit,
      type: params.memoryType,
      scene: params.scene,
    }));
  }

  async searchConversations(params: {
    query: string;
    limit?: number;
    sessionKey?: string;
  }): Promise<TencentMemorySearchResult> {
    await this.ensureInitialized();
    const tool = this.tools.get("tdai_conversation_search");
    if (!tool) throw new Error("tdai_conversation_search is not available; TencentDB-Agent-Memory is disabled or not initialized.");
    return this.normalizeToolResult(await tool.execute("deepseekcode_conversation_search", {
      query: params.query,
      limit: params.limit,
      session_key: params.sessionKey,
    }));
  }

  private normalizeToolResult(raw: unknown): TencentMemorySearchResult {
    if (!raw || typeof raw !== "object") return { text: String(raw ?? "") };
    const record = raw as { content?: Array<{ type?: string; text?: string }>; details?: unknown };
    const text = record.content
      ?.map((item) => item.type === "text" && typeof item.text === "string" ? item.text : "")
      .filter(Boolean)
      .join("\n") ?? JSON.stringify(raw, null, 2);
    return { text, details: record.details };
  }

  private async ensureInitialized(runId?: string): Promise<void> {
    if (this.initialized || this.initializing || !this.isEnabled()) {
      await this.initializing;
      return;
    }
    this.initializing = this.loadPlugin(runId)
      .then(() => {
        this.initialized = true;
      })
      .catch((error) => {
        this.disabledReason = error instanceof Error ? error.message : String(error);
        this.state?.appendEvent(runId ?? null, "tdai_memory_init_failed", {
          message: this.disabledReason,
        });
      })
      .finally(() => {
        this.initializing = undefined;
      });
    await this.initializing;
  }

  private async loadPlugin(runId?: string): Promise<void> {
    const vendorUrl = new URL("../../vendor/tencentdb-agent-memory/index.mjs", import.meta.url);
    const module = await import(vendorUrl.href) as { default?: (api: unknown) => void };
    if (typeof module.default !== "function") {
      throw new Error("TencentDB-Agent-Memory vendor bundle does not export a plugin register function.");
    }
    module.default(this.pluginApi());
    this.state?.appendEvent(runId ?? null, "tdai_memory_initialized", this.status);
  }

  private pluginApi(): Record<string, unknown> {
    const logger = this.logger();
    return {
      registrationMode: "runtime",
      pluginConfig: this.memoryPluginConfig(),
      config: {},
      logger,
      runtime: {
        version: "2026.4.24",
        config: {},
        state: {
          resolveStateDir: () => this.pluginStateDir(),
        },
        agent: {
          runEmbeddedPiAgent: async () => {
            throw new Error("DeepSeekCode uses TencentDB-Agent-Memory standalone LLM mode, not OpenClaw embedded agents.");
          },
        },
      },
      registerTool: (tool: TencentToolRegistration) => {
        if (tool?.name && typeof tool.execute === "function") this.tools.set(tool.name, tool);
      },
      registerCli: () => undefined,
      on: (name: HookName, handler: HookHandler) => {
        const list = this.hooks.get(name) ?? [];
        list.push(handler);
        this.hooks.set(name, list);
      },
    };
  }

  private memoryPluginConfig(): Record<string, unknown> {
    const provider = this.providerConfig;
    const llmEnabled = Boolean(provider?.apiKey && provider.baseUrl && provider.model);
    const extractionEnabled = boolEnv("DEEPSEEKCODE_TDAI_EXTRACTION", true) && llmEnabled;
    const embeddingProvider = env("DEEPSEEKCODE_TDAI_EMBEDDING_PROVIDER") ?? "none";
    return {
      capture: {
        enabled: boolEnv("DEEPSEEKCODE_TDAI_CAPTURE", true),
        l0l1RetentionDays: numberEnv("DEEPSEEKCODE_TDAI_RETENTION_DAYS", 0),
      },
      recall: {
        enabled: boolEnv("DEEPSEEKCODE_TDAI_RECALL", true),
        maxResults: numberEnv("DEEPSEEKCODE_TDAI_RECALL_RESULTS", 5),
        maxTotalRecallChars: numberEnv("DEEPSEEKCODE_TDAI_RECALL_CHARS", 3000),
      },
      extraction: {
        enabled: extractionEnabled,
        enableDedup: true,
        maxMemoriesPerSession: numberEnv("DEEPSEEKCODE_TDAI_MAX_MEMORIES", 20),
        model: `deepseek/${provider?.model ?? this.model}`,
      },
      persona: {
        triggerEveryN: numberEnv("DEEPSEEKCODE_TDAI_PERSONA_TRIGGER", 50),
        maxScenes: numberEnv("DEEPSEEKCODE_TDAI_MAX_SCENES", 20),
        model: `deepseek/${provider?.model ?? this.model}`,
      },
      pipeline: {
        everyNConversations: numberEnv("DEEPSEEKCODE_TDAI_EVERY_N", 5),
        enableWarmup: boolEnv("DEEPSEEKCODE_TDAI_WARMUP", true),
        l1IdleTimeoutSeconds: numberEnv("DEEPSEEKCODE_TDAI_L1_IDLE_SECONDS", 600),
      },
      storeBackend: env("DEEPSEEKCODE_TDAI_STORE") === "tcvdb" ? "tcvdb" : "sqlite",
      tcvdb: {
        url: env("DEEPSEEKCODE_TCVDB_URL") ?? "",
        username: env("DEEPSEEKCODE_TCVDB_USERNAME") ?? "root",
        apiKey: env("DEEPSEEKCODE_TCVDB_API_KEY") ?? "",
        database: env("DEEPSEEKCODE_TCVDB_DATABASE") ?? "",
        alias: env("DEEPSEEKCODE_TCVDB_ALIAS") ?? "DeepSeekCode",
        embeddingModel: env("DEEPSEEKCODE_TCVDB_EMBEDDING_MODEL") ?? "bge-large-zh",
      },
      embedding: {
        enabled: embeddingProvider !== "none",
        provider: embeddingProvider,
        baseUrl: env("DEEPSEEKCODE_TDAI_EMBEDDING_BASE_URL") ?? "",
        apiKey: env("DEEPSEEKCODE_TDAI_EMBEDDING_API_KEY") ?? "",
        model: env("DEEPSEEKCODE_TDAI_EMBEDDING_MODEL") ?? "",
        dimensions: numberEnv("DEEPSEEKCODE_TDAI_EMBEDDING_DIMENSIONS", 0),
        sendDimensions: boolEnv("DEEPSEEKCODE_TDAI_EMBEDDING_SEND_DIMENSIONS", true),
      },
      bm25: {
        enabled: true,
        language: "zh",
      },
      llm: {
        enabled: llmEnabled,
        baseUrl: provider?.baseUrl ?? "",
        apiKey: provider?.apiKey ?? "",
        model: provider?.model ?? this.model,
        maxTokens: numberEnv("DEEPSEEKCODE_TDAI_LLM_MAX_TOKENS", 2048),
        timeoutMs: numberEnv("DEEPSEEKCODE_TDAI_LLM_TIMEOUT_MS", 120000),
      },
      offload: {
        enabled: false,
      },
      report: {
        enabled: false,
        type: "local",
      },
    };
  }

  private async runHooks(name: HookName, event: Record<string, unknown>, context: TencentHookContext): Promise<unknown> {
    let lastResult: unknown;
    for (const handler of this.hooks.get(name) ?? []) {
      const result = await handler(event, context);
      if (result !== undefined) lastResult = result;
    }
    return lastResult;
  }

  private hookContext(): TencentHookContext {
    const sessionKey = this.currentSessionKey();
    return {
      sessionKey,
      sessionId: sessionKey,
      agentName: "deepseekcode",
    };
  }

  private currentSessionKey(): string {
    const safeProject = this.config.projectPath.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(-96);
    return `deepseekcode_${safeProject}`;
  }

  private pluginStateDir(): string {
    return path.join(this.config.dataDir, "tdai");
  }

  private isEnabled(): boolean {
    return env("DEEPSEEKCODE_TDAI_MEMORY") !== "off";
  }

  private logger() {
    const append = (level: string, message: string) => {
      if (level === "error" || level === "warn") {
        this.state?.appendEvent(null, "tdai_memory_log", { level, message });
      }
    };
    return {
      debug: (_message: string) => undefined,
      info: (_message: string) => undefined,
      warn: (message: string) => append("warn", message),
      error: (message: string) => append("error", message),
    };
  }
}

function isRecallResult(value: unknown): value is TencentMemoryRecall {
  return Boolean(value && typeof value === "object" && (
    "prependContext" in value ||
    "appendSystemContext" in value ||
    "recalledL1Memories" in value ||
    "recalledL3Persona" in value
  ));
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = env(name);
  if (!value) return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number): number {
  const value = env(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function tencentMemoryVendorUrl(): string {
  return pathToFileURL(path.join("src", "vendor", "tencentdb-agent-memory", "README.upstream.md")).href;
}
