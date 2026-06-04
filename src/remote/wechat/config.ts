import fs from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";
import { parseRemoteCsv } from "../accessPolicy.js";
import { authRoot, listStoredAccounts } from "./openclawClient.js";

export interface WeChatOpenClawConfig {
  enabled: boolean;
  accountId?: string;
  apiBaseUrl: string;
  allowedUsers: string[];
  allowedGroups: string[];
  projectRoots: string[];
  mentionNames: string[];
  qrPollIntervalMs: number;
  longPollTimeoutMs: number;
}

export function readWeChatOpenClawConfig(runtime: RuntimeConfig): WeChatOpenClawConfig {
  return {
    enabled: readBoolean("DEEPSEEKCODE_WECHAT_OPENCLAW_ENABLED", true),
    accountId: readOptional("DEEPSEEKCODE_WECHAT_ACCOUNT_ID"),
    apiBaseUrl: readOptional("DEEPSEEKCODE_WECHAT_API_BASE_URL") ?? "https://ilinkai.weixin.qq.com",
    allowedUsers: parseRemoteCsv(process.env.DEEPSEEKCODE_WECHAT_ALLOWED_USERS),
    allowedGroups: parseRemoteCsv(process.env.DEEPSEEKCODE_WECHAT_ALLOWED_GROUPS),
    projectRoots: parseRemoteCsv(process.env.DEEPSEEKCODE_WECHAT_PROJECT_ROOTS),
    mentionNames: unique(parseRemoteCsv(process.env.DEEPSEEKCODE_WECHAT_MENTION_NAMES).concat([
      "DeepSeekCode",
      "deepseekcode",
    ])),
    qrPollIntervalMs: readPositiveInt("DEEPSEEKCODE_WECHAT_QR_POLL_INTERVAL_MS", 2000),
    longPollTimeoutMs: readPositiveInt("DEEPSEEKCODE_WECHAT_LONG_POLL_TIMEOUT_MS", 35000),
  };
}

export function formatWeChatOpenClawStatus(runtime: RuntimeConfig): string {
  const config = readWeChatOpenClawConfig(runtime);
  const accounts = listStoredAccounts(authRoot(runtime.dataDir));
  const selected = config.accountId ?? accounts.at(-1)?.accountId;
  const selectedAccount = selected ? accounts.find((account) => account.accountId === selected) : undefined;
  return [
    "WeChat OpenClaw remote control",
    `enabled=${config.enabled}`,
    `login=${selectedAccount ? "logged-in" : "needs login"}`,
    `account=${selectedAccount?.accountId ?? selected ?? "none"}`,
    `project=${runtime.projectPath}`,
    `apiBaseUrl=${config.apiBaseUrl}`,
    `allowedUsers=${config.allowedUsers.length || "all-private"}`,
    `allowedGroups=${config.allowedGroups.length || "mention-or-slash"}`,
    `projectRoots=${config.projectRoots.length ? config.projectRoots.join("; ") : runtime.projectPath}`,
  ].join("\n");
}

export function hasWeChatOpenClawLogin(runtime: RuntimeConfig): boolean {
  return listStoredAccounts(authRoot(runtime.dataDir)).length > 0;
}

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = readOptional(name);
  if (!value) return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(readOptional(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function ensureWeChatAuthDir(runtime: RuntimeConfig): string {
  const root = authRoot(runtime.dataDir);
  fs.mkdirSync(path.join(root, "accounts"), { recursive: true });
  return root;
}
