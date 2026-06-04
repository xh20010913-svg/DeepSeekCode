import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WeChatOpenClawConfig } from "./config.js";

interface LoginQrModule {
  startWeixinLoginWithQr(input: {
    verbose?: boolean;
    force?: boolean;
    accountId?: string;
    apiBaseUrl?: string;
    botType?: string;
  }): Promise<{ qrcodeUrl?: string; message?: string; sessionKey: string }>;
  waitForWeixinLogin(input: {
    timeoutMs?: number;
    verbose?: boolean;
    sessionKey: string;
    apiBaseUrl?: string;
    botType?: string;
  }): Promise<{
    connected?: boolean;
    alreadyConnected?: boolean;
    botToken?: string;
    accountId?: string;
    baseUrl?: string;
    userId?: string;
    message?: string;
  }>;
}

interface ApiModule {
  getUpdates(input: {
    baseUrl: string;
    token: string;
    get_updates_buf?: string;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
  }): Promise<OpenClawUpdatesResponse>;
  sendMessage(input: {
    baseUrl: string;
    token: string;
    timeoutMs?: number;
    body: unknown;
  }): Promise<void>;
}

interface SendMediaModule {
  sendWeixinMediaFile(input: {
    filePath: string;
    to: string;
    text?: string;
    opts: {
      baseUrl: string;
      token: string;
      contextToken?: string;
      runId?: string;
      timeoutMs?: number;
    };
    cdnBaseUrl: string;
  }): Promise<{ messageId?: string }>;
}

export interface StoredWeChatAccount {
  accountId: string;
  token: string;
  baseUrl: string;
  userId?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface OpenClawMessageItem {
  type?: number;
  text_item?: { text?: string };
  image_item?: { url?: string; full_url?: string; aeskey?: string; file_name?: string };
  voice_item?: { text?: string; url?: string; full_url?: string; aeskey?: string; file_name?: string };
  file_item?: { url?: string; full_url?: string; aeskey?: string; file_name?: string; file_size?: number };
  video_item?: { url?: string; full_url?: string; aeskey?: string; file_name?: string };
}

export interface OpenClawMessage {
  msgid?: string;
  message_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  session_id?: string;
  group_id?: string;
  context_token?: string;
  item_list?: OpenClawMessageItem[];
  [key: string]: unknown;
}

interface OpenClawUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: OpenClawMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface OpenClawWeixinClientOptions {
  dataDir: string;
  config: WeChatOpenClawConfig;
  onStatus?: (line: string) => void;
}

export class OpenClawWeixinClient {
  private account?: StoredWeChatAccount;
  private getUpdatesBuf = "";

  constructor(private readonly options: OpenClawWeixinClientOptions) {
    this.account = this.loadPreferredAccount();
    this.getUpdatesBuf = this.readSyncBuf(this.account?.accountId);
  }

  status(): string {
    if (!this.options.config.enabled) return "disabled";
    if (!this.account) return "needs login";
    return `logged-in:${this.account.accountId}`;
  }

  currentAccount(): StoredWeChatAccount | undefined {
    return this.account;
  }

  async login(): Promise<StoredWeChatAccount> {
    const login = await loadLoginQrModule();
    const accountId = this.options.config.accountId;
    const started = await login.startWeixinLoginWithQr({
      accountId,
      apiBaseUrl: this.options.config.apiBaseUrl,
      force: true,
      verbose: false,
    });
    if (started.qrcodeUrl) {
      if (this.options.onStatus) {
        this.options.onStatus(await formatLoginQrForStatus(started.qrcodeUrl));
      } else {
        process.stdout.write(`${await formatLoginQrForStatus(started.qrcodeUrl)}\n`);
      }
    } else {
      this.options.onStatus?.("OpenClaw login started, but no QR code was returned.");
    }
    this.options.onStatus?.("Waiting for WeChat scan confirmation...");
    const waited = await login.waitForWeixinLogin({
      sessionKey: started.sessionKey,
      timeoutMs: Math.max(300_000, this.options.config.qrPollIntervalMs * 60),
      apiBaseUrl: this.options.config.apiBaseUrl,
      verbose: false,
    });
    if (!waited.connected && !waited.alreadyConnected) {
      throw new Error(waited.message || "WeChat OpenClaw login did not complete.");
    }
    if (!waited.botToken) {
      throw new Error("WeChat OpenClaw login completed without bot token.");
    }
    const now = Date.now();
    const stored: StoredWeChatAccount = {
      accountId: safeAccountId(waited.accountId || accountId || waited.userId || randomUUID()),
      token: waited.botToken,
      baseUrl: waited.baseUrl || this.options.config.apiBaseUrl,
      userId: waited.userId,
      createdAtMs: now,
      updatedAtMs: now,
    };
    saveAccount(authRoot(this.options.dataDir), stored);
    this.account = stored;
    this.getUpdatesBuf = this.readSyncBuf(stored.accountId);
    return stored;
  }

  async poll(onMessage: (message: OpenClawMessage) => Promise<void>, signal?: AbortSignal): Promise<void> {
    const api = await loadApiModule();
    const account = this.requireAccount();
    this.options.onStatus?.(`polling account=${account.accountId}`);
    while (!signal?.aborted) {
      try {
        const response = await api.getUpdates({
          baseUrl: account.baseUrl,
          token: account.token,
          get_updates_buf: this.getUpdatesBuf,
          timeoutMs: this.options.config.longPollTimeoutMs,
          abortSignal: signal,
        });
        if (signal?.aborted) break;
        const isError = (response.ret !== undefined && response.ret !== 0) ||
          (response.errcode !== undefined && response.errcode !== 0);
        if (isError) {
          const code = response.errcode ?? response.ret;
          this.options.onStatus?.(`getupdates error ${code}: ${response.errmsg ?? ""}`);
          await delay(2000, signal);
          continue;
        }
        if (response.longpolling_timeout_ms && response.longpolling_timeout_ms > 0) {
          this.options.config.longPollTimeoutMs = response.longpolling_timeout_ms;
        }
        if (response.get_updates_buf) {
          this.getUpdatesBuf = response.get_updates_buf;
          this.writeSyncBuf(account.accountId, this.getUpdatesBuf);
        }
        for (const message of response.msgs ?? []) {
          await onMessage(message);
        }
      } catch (error) {
        if (signal?.aborted) break;
        this.options.onStatus?.(`getupdates failed: ${errorMessage(error)}`);
        await delay(3000, signal);
      }
    }
  }

  async sendText(toUserId: string, text: string, contextToken?: string): Promise<void> {
    const api = await loadApiModule();
    const account = this.requireAccount();
    await api.sendMessage({
      baseUrl: account.baseUrl,
      token: account.token,
      body: buildTextMessage(toUserId, text, contextToken),
    });
  }

  async sendMediaFile(toUserId: string, filePath: string, text?: string, contextToken?: string): Promise<void> {
    const media = await loadSendMediaModule();
    const account = this.requireAccount();
    await media.sendWeixinMediaFile({
      filePath,
      to: toUserId,
      text,
      opts: {
        baseUrl: account.baseUrl,
        token: account.token,
        contextToken,
      },
      cdnBaseUrl: this.options.config.cdnBaseUrl,
    });
  }

  async saveInboundMedia(item: OpenClawMessageItem, inboxDir: string, fallbackName: string): Promise<{ path: string; bytes: number }> {
    const url = item.file_item?.full_url || item.file_item?.url ||
      item.image_item?.full_url || item.image_item?.url ||
      item.voice_item?.full_url || item.voice_item?.url ||
      item.video_item?.full_url || item.video_item?.url;
    const filename = safeFilename(
      item.file_item?.file_name ||
      item.image_item?.file_name ||
      item.voice_item?.file_name ||
      item.video_item?.file_name ||
      fallbackName,
    );
    fs.mkdirSync(inboxDir, { recursive: true });
    if (!url) {
      const target = path.join(inboxDir, `${Date.now()}-${filename}.json`);
      fs.writeFileSync(target, JSON.stringify(item, null, 2), "utf-8");
      return { path: target, bytes: fs.statSync(target).size };
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`download media failed ${response.status}: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const target = path.join(inboxDir, `${Date.now()}-${filename}`);
    fs.writeFileSync(target, bytes);
    return { path: target, bytes: bytes.length };
  }

  private requireAccount(): StoredWeChatAccount {
    if (!this.account) {
      throw new Error("WeChat OpenClaw is not logged in. Run deepseekcode --wechat-login first.");
    }
    return this.account;
  }

  private loadPreferredAccount(): StoredWeChatAccount | undefined {
    const accounts = listStoredAccounts(authRoot(this.options.dataDir));
    if (this.options.config.accountId) {
      return accounts.find((account) => account.accountId === this.options.config.accountId);
    }
    return accounts.at(-1);
  }

  private readSyncBuf(accountId: string | undefined): string {
    if (!accountId) return "";
    const file = syncBufPath(this.options.dataDir, accountId);
    if (!fs.existsSync(file)) return "";
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { get_updates_buf?: string };
      return parsed.get_updates_buf ?? "";
    } catch {
      return "";
    }
  }

  private writeSyncBuf(accountId: string, value: string): void {
    const file = syncBufPath(this.options.dataDir, accountId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ get_updates_buf: value }), "utf-8");
  }
}

export function authRoot(dataDir: string): string {
  return path.join(dataDir, "remote", "wechat-openclaw", "auth");
}

export function inboxRoot(dataDir: string, chatId: string): string {
  return path.join(dataDir, "remote", "wechat-openclaw", "inbox", safeFilename(chatId));
}

export function listStoredAccounts(root: string): StoredWeChatAccount[] {
  const dir = path.join(root, "accounts");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as StoredWeChatAccount;
      } catch {
        return undefined;
      }
    })
    .filter((account): account is StoredWeChatAccount => Boolean(account?.accountId && account.token));
}

function saveAccount(root: string, account: StoredWeChatAccount): void {
  const dir = path.join(root, "accounts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${safeFilename(account.accountId)}.json`), JSON.stringify(account, null, 2), "utf-8");
}

async function formatLoginQrForStatus(qrcodeUrl: string): Promise<string> {
  const lines = [
    "OpenClaw 微信登录二维码",
    "请用微信扫码确认登录。二维码 5 分钟内有效。",
    "",
  ];
  const qr = await renderTerminalQr(qrcodeUrl).catch(() => "");
  if (qr.trim()) lines.push(qr.trim(), "");
  lines.push(`如果二维码没有显示，复制这个链接打开：${qrcodeUrl}`);
  return lines.join("\n");
}

async function renderTerminalQr(qrcodeUrl: string): Promise<string> {
  const imported = await import("qrcode-terminal") as unknown as {
    default?: QrTerminalModule;
    generate?: QrTerminalModule["generate"];
  };
  const qr = imported.default ?? imported;
  const generate = qr.generate;
  if (typeof generate !== "function") return "";
  return await new Promise((resolve) => {
    generate(qrcodeUrl, { small: true }, (output) => resolve(output));
  });
}

interface QrTerminalModule {
  generate(input: string, options: { small?: boolean }, callback: (output: string) => void): void;
}

function syncBufPath(dataDir: string, accountId: string): string {
  return path.join(dataDir, "remote", "wechat-openclaw", "sync", `${safeFilename(accountId)}.json`);
}

async function loadLoginQrModule(): Promise<LoginQrModule> {
  return await import("@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js") as LoginQrModule;
}

async function loadApiModule(): Promise<ApiModule> {
  return await import("@tencent-weixin/openclaw-weixin/dist/src/api/api.js") as ApiModule;
}

async function loadSendMediaModule(): Promise<SendMediaModule> {
  return await import("@tencent-weixin/openclaw-weixin/dist/src/messaging/send-media.js") as SendMediaModule;
}

function buildTextMessage(toUserId: string, text: string, contextToken: string | undefined): unknown {
  return {
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: `deepseekcode-${randomUUID()}`,
      message_type: 2,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text } }],
      context_token: contextToken,
    },
  };
}

function safeAccountId(value: string): string {
  return safeFilename(value) || randomUUID();
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "file";
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
