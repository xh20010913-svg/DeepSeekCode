import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import type { ProviderConfig } from "../protocol/provider.js";
import {
  normalizeProfileName,
  type PermissionProfileName,
} from "../services/permissions/permissionProfiles.js";
import { budgetFor, readInferenceEffort } from "../services/inference/inferenceSettingsService.js";

export interface RuntimeConfig {
  projectPath: string;
  dataDir: string;
  stateDbPath: string;
  model: string;
  provider: ProviderConfig | null;
  shellEnabled: boolean;
  browserEnabled: boolean;
  permissionProfile: PermissionProfileName;
}

export interface BootstrapOptions {
  project?: string;
  dataDir?: string;
  model?: string;
  allowShell?: boolean;
  allowBrowser?: boolean;
  permissionProfile?: string;
}

interface ProviderProfileDocument {
  default_profile?: string;
  profiles?: Array<{
    name: string;
    kind?: string;
    base_url: string;
    api_key?: string;
    api_key_env?: string;
    model: string;
    timeout_secs?: number;
    reasoning_effort?: string;
  }>;
}

export function bootstrapConfig(options: BootstrapOptions): RuntimeConfig {
  const projectPath = path.resolve(options.project ?? process.cwd());
  loadEnvFiles(projectPath);

  const dataDir = path.resolve(
    options.dataDir ??
      process.env.DEEPSEEKCODE_HOME ??
      path.join(os.homedir(), ".deepseekcode"),
  );
  const stateDir = path.join(dataDir, "state");
  fs.mkdirSync(stateDir, { recursive: true });

  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const permissionProfile = normalizeProfileName(
    options.permissionProfile ?? process.env.DEEPSEEKCODE_PERMISSION_PROFILE ?? "safe",
  ) ?? "safe";
  const grants = permissionProfileToGrants(permissionProfile);
  return {
    projectPath,
    dataDir,
    stateDbPath: path.join(stateDir, "deepseekcode.sqlite"),
    model,
    provider: resolveProviderConfig(projectPath, model),
    shellEnabled: Boolean(options.allowShell) || grants.allowShell,
    browserEnabled: Boolean(options.allowBrowser) || grants.allowBrowser,
    permissionProfile,
  };
}

function permissionProfileToGrants(profile: PermissionProfileName): {
  allowShell: boolean;
  allowBrowser: boolean;
} {
  if (profile === "open") return { allowShell: true, allowBrowser: true };
  if (profile === "dev") return { allowShell: true, allowBrowser: false };
  if (profile === "browser") return { allowShell: false, allowBrowser: true };
  return { allowShell: false, allowBrowser: false };
}

export function loadEnvFiles(projectPath: string): void {
  dotenv.config({ path: path.resolve(".env"), override: false, quiet: true });
  dotenv.config({ path: path.join(projectPath, ".env"), override: false, quiet: true });
}

function resolveProviderConfig(projectPath: string, requested: string): ProviderConfig | null {
  const inferenceBudget = budgetFor(readInferenceEffort(projectPath));
  const fromProfile = readProviderProfile(projectPath, requested);
  if (fromProfile) return { ...fromProfile, maxOutputTokens: numberEnv("DEEPSEEKCODE_MAX_OUTPUT_TOKENS", inferenceBudget.maxOutputTokens) };

  const apiKey = readEnv("DEEPSEEK_API_KEY");
  if (!apiKey) return null;

  return {
    name: "deepseek-default",
    kind: "open_ai_compatible",
    baseUrl: readEnv("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com",
    apiKey,
    model: readEnv("DEEPSEEK_MODEL") ?? requested,
    timeoutSecs: numberEnv("DEEPSEEK_TIMEOUT_SECS", 45),
    reasoningEffort: readEnv("DEEPSEEKCODE_REASONING_EFFORT") ?? "high",
    maxOutputTokens: numberEnv("DEEPSEEKCODE_MAX_OUTPUT_TOKENS", inferenceBudget.maxOutputTokens),
  };
}

function readProviderProfile(projectPath: string, requested: string): ProviderConfig | null {
  const paths = [
    readEnv("DEEPSEEKCODE_PROVIDER_CONFIG"),
    path.join(projectPath, ".deepseekcode", "providers.json"),
    process.env.DEEPSEEKCODE_HOME
      ? path.join(process.env.DEEPSEEKCODE_HOME, "config", "providers.json")
      : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const profilePath of paths) {
    if (!fs.existsSync(profilePath)) continue;
    const document = JSON.parse(fs.readFileSync(profilePath, "utf8")) as ProviderProfileDocument;
    const selected =
      requested === "deepseek-default"
        ? document.default_profile ?? requested
        : requested;
    const profile = document.profiles?.find((entry) => entry.name === selected);
    if (!profile) continue;
    const apiKey =
      profile.api_key ??
      (profile.api_key_env ? readEnv(profile.api_key_env) : undefined) ??
      "";
    if (!apiKey) continue;
    return {
      name: profile.name,
      kind: "open_ai_compatible",
      baseUrl: profile.base_url,
      apiKey,
      model: profile.model,
      timeoutSecs: Math.max(1, profile.timeout_secs ?? 45),
      reasoningEffort: profile.reasoning_effort ?? readEnv("DEEPSEEKCODE_REASONING_EFFORT") ?? "high",
      maxOutputTokens: numberEnv("DEEPSEEKCODE_MAX_OUTPUT_TOKENS", 1200),
    };
  }

  return null;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberEnv(name: string, fallback: number): number {
  const value = readEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
