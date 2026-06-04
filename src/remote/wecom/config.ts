import type { RuntimeConfig } from "../../bootstrap/config.js";
import { parseRemoteCsv } from "../accessPolicy.js";

export interface WeComRemoteConfig {
  botId: string;
  secret: string;
  wsUrl?: string;
  allowedUsers: string[];
  allowedGroups: string[];
  projectRoots: string[];
  botMentionNames: string[];
}

export function readWeComRemoteConfig(runtime: RuntimeConfig): WeComRemoteConfig {
  return {
    botId: readRequired("DEEPSEEKCODE_WECOM_BOT_ID"),
    secret: readRequired("DEEPSEEKCODE_WECOM_BOT_SECRET"),
    wsUrl: readOptional("DEEPSEEKCODE_WECOM_WS_URL"),
    allowedUsers: parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_ALLOWED_USERS),
    allowedGroups: parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_ALLOWED_GROUPS),
    projectRoots: parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_PROJECT_ROOTS),
    botMentionNames: parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_MENTION_NAMES).concat([
      "DeepSeekCode",
      "deepseekcode",
    ]),
  };
}

export function hasWeComRemoteConfig(): boolean {
  return Boolean(readOptional("DEEPSEEKCODE_WECOM_BOT_ID") && readOptional("DEEPSEEKCODE_WECOM_BOT_SECRET"));
}

export function formatWeComConfigStatus(runtime: RuntimeConfig): string {
  const configured = hasWeComRemoteConfig();
  const roots = parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_PROJECT_ROOTS);
  return [
    "WeCom remote control",
    `configured=${configured}`,
    `project=${runtime.projectPath}`,
    `wsUrl=${readOptional("DEEPSEEKCODE_WECOM_WS_URL") ?? "wss://openws.work.weixin.qq.com"}`,
    `allowedUsers=${parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_ALLOWED_USERS).length || "all"}`,
    `allowedGroups=${parseRemoteCsv(process.env.DEEPSEEKCODE_WECOM_ALLOWED_GROUPS).length || "all"}`,
    `projectRoots=${roots.length ? roots.join("; ") : runtime.projectPath}`,
  ].join("\n");
}

function readRequired(name: string): string {
  const value = readOptional(name);
  if (!value) throw new Error(`${name} is required for WeCom remote control.`);
  return value;
}

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
