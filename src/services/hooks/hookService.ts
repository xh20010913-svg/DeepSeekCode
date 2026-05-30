import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { eventNeedsToolMatcher, normalizeHookId, parseHooksConfig, renderHooksConfig, validateHooksConfig, type HookDefinition, type HooksConfig, type HooksValidationResult } from "../../hooks/config.js";
import { isHookEvent, type HookEvent } from "../../hooks/events.js";
import { enabledPluginManifests } from "../../plugins/extensions.js";
import { safeOptionalJoin } from "../../tools/pathSafety.js";

export interface HookExecutionResult {
  id: string;
  event: HookEvent;
  matcher?: string;
  command: string;
  status: "skipped" | "succeeded" | "failed";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  message?: string;
}

export interface HookDecisionResult {
  event: HookEvent;
  blocked: boolean;
  reason?: string;
  results: HookExecutionResult[];
}

export class HookService {
  constructor(
    private readonly projectPath: string,
    private readonly dataDir = projectPath,
  ) {}

  get configPath(): string {
    return path.join(this.projectPath, ".deepseekcode", "hooks.json");
  }

  list(): HookDefinition[] {
    return [...this.readConfig().hooks, ...this.pluginHooks()];
  }

  add(input: {
    id: string;
    event: string;
    command: string;
    matcher?: string;
    description?: string;
    timeoutMs?: number;
  }): HookDefinition {
    const id = normalizeHookId(input.id);
    if (!id) throw new Error("hook id is empty");
    if (!isHookEvent(input.event)) throw new Error(`unknown hook event: ${input.event}`);
    const command = input.command.trim();
    if (!command) throw new Error("hook command is empty");
    const config = this.readConfig();
    if (config.hooks.some((hook) => hook.id === id)) throw new Error(`hook already exists: ${id}`);
    const hook: HookDefinition = {
      id,
      event: input.event,
      matcher: input.matcher?.trim() || undefined,
      command,
      description: input.description?.trim() || undefined,
      timeout_ms: input.timeoutMs ?? 10_000,
      enabled: true,
    };
    config.hooks.push(hook);
    this.writeConfig(config);
    return hook;
  }

  remove(id: string): boolean {
    const config = this.readConfig();
    const before = config.hooks.length;
    config.hooks = config.hooks.filter((hook) => hook.id !== id);
    if (config.hooks.length === before) return false;
    this.writeConfig(config);
    return true;
  }

  validate(): HooksValidationResult {
    return validateHooksConfig(
      this.configPath,
      fs.existsSync(this.configPath) ? fs.readFileSync(this.configPath, "utf8") : null,
    );
  }

  async runEvent(
    event: HookEvent,
    payload: Record<string, unknown>,
    options: { allowShell: boolean; maxOutputChars?: number } = { allowShell: false },
  ): Promise<HookExecutionResult[]> {
    const hooks = this.list().filter((hook) => hook.enabled && hook.event === event && hookMatches(hook, payload));
    const results: HookExecutionResult[] = [];
    for (const hook of hooks) {
      results.push(await runHookCommand(this.projectPath, hook, payload, {
        allowShell: options.allowShell,
        maxOutputChars: options.maxOutputChars ?? 8_000,
      }));
    }
    return results;
  }

  async runPreToolUse(
    payload: Record<string, unknown>,
    options: { allowShell: boolean; maxOutputChars?: number } = { allowShell: false },
  ): Promise<HookDecisionResult> {
    const results = await this.runEvent("PreToolUse", payload, options);
    const explicitBlock = results
      .map((result) => ({ result, decision: parseHookDecision(result.stdout) }))
      .find((item) => item.decision?.decision === "block" || item.decision?.decision === "deny");
    if (explicitBlock) {
      return {
        event: "PreToolUse",
        blocked: true,
        reason: explicitBlock.decision?.reason || `blocked by hook ${explicitBlock.result.id}`,
        results,
      };
    }
    const failed = results.find((result) => result.status === "failed");
    if (failed) {
      return {
        event: "PreToolUse",
        blocked: true,
        reason: failed.stderr.trim() || failed.stdout.trim() || `hook ${failed.id} failed`,
        results,
      };
    }
    return { event: "PreToolUse", blocked: false, results };
  }


  private readConfig(): HooksConfig {
    if (!fs.existsSync(this.configPath)) return { hooks: [] };
    return parseHooksConfig(JSON.parse(fs.readFileSync(this.configPath, "utf8")));
  }

  private writeConfig(config: HooksConfig): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, renderHooksConfig(config), "utf8");
  }

  private pluginHooks(): HookDefinition[] {
    const hooks: HookDefinition[] = [];
    for (const plugin of enabledPluginManifests(this.projectPath, this.dataDir)) {
      for (const hook of plugin.manifest?.hooks ?? []) {
        hooks.push({
          ...hook,
          id: `${plugin.name}:${normalizeHookId(hook.id)}`,
          description: hook.description ?? `Hook from plugin ${plugin.name}`,
        });
      }
    }
    return hooks;
  }
}

function parseHookDecision(stdout: string): { decision?: string; reason?: string } | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { decision?: unknown; reason?: unknown };
    return {
      decision: typeof parsed.decision === "string" ? parsed.decision.toLowerCase() : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

function hookMatches(hook: HookDefinition, payload: Record<string, unknown>): boolean {
  if (!eventNeedsToolMatcher(hook.event) || !hook.matcher) return true;
  const toolName = String(payload.tool_name ?? "");
  return hook.matcher === "*" || hook.matcher === toolName;
}

function runHookCommand(
  root: string,
  hook: HookDefinition,
  payload: Record<string, unknown>,
  options: { allowShell: boolean; maxOutputChars: number },
): Promise<HookExecutionResult> {
  if (!options.allowShell) {
    return Promise.resolve({
      id: hook.id,
      event: hook.event,
      matcher: hook.matcher,
      command: hook.command,
      status: "skipped",
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      message: "shell execution is disabled; enable it with /shell on",
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(hook.command, {
      cwd: safeOptionalJoin(root, ""),
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const collect = (chunk: Buffer, current: string) =>
      (current + chunk.toString()).slice(-options.maxOutputChars);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = collect(chunk, stdout);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = collect(chunk, stderr);
    });
    child.on("error", reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, hook.timeout_ms);

    child.stdin.end(`${JSON.stringify({
      hook_id: hook.id,
      event: hook.event,
      matcher: hook.matcher,
      payload,
    })}\n`);

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        id: hook.id,
        event: hook.event,
        matcher: hook.matcher,
        command: hook.command,
        status: exitCode === 0 && !timedOut ? "succeeded" : "failed",
        exitCode,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}
