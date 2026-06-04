import fs from "node:fs";
import path from "node:path";
import { bootstrapConfig, type RuntimeConfig } from "../../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import { QueryEngine } from "../../query/QueryEngine.js";
import { ApprovalService } from "../../services/approval/approvalService.js";
import { DeepSeekClient } from "../../services/deepseek/client.js";
import type { RuntimePermissionState } from "../../services/permissions/permissionProfiles.js";
import { StateStore } from "../../state/sqlite.js";
import { RemoteAccessPolicy } from "../accessPolicy.js";
import { RemoteProjectBinding } from "../projectBinding.js";
import { compactOneLine, redactRemoteText } from "../redact.js";
import { RemoteReplyRenderer } from "../renderer.js";
import type { RemoteAttachment, RemoteChannel, RemoteMessage } from "../types.js";
import { readWeChatOpenClawConfig, type WeChatOpenClawConfig } from "./config.js";
import {
  inboxRoot,
  OpenClawWeixinClient,
  type OpenClawMessage,
  type OpenClawMessageItem,
} from "./openclawClient.js";

interface RuntimeBundle {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
  closeWithService: boolean;
}

interface ActiveRun {
  engine: QueryEngine;
  renderer: RemoteReplyRenderer;
  permissions: RuntimePermissionState;
  projectPath: string;
  runId?: string;
  contextToken?: string;
  replyTarget: string;
}

interface PendingApproval {
  chatId: string;
  projectPath: string;
  runId: string;
  gateId: string;
  summary: string;
}

export interface WeChatOpenClawRemoteControlOptions {
  baseConfig: RuntimeConfig;
  baseState: StateStore;
  baseProvider: DeepSeekProviderClient | null;
  permissions: RuntimePermissionState;
  onStatus?: (line: string) => void;
}

export class WeChatOpenClawRemoteControlService implements RemoteChannel {
  readonly name = "wechat-openclaw" as const;

  private client?: OpenClawWeixinClient;
  private remoteConfig?: WeChatOpenClawConfig;
  private accessPolicy?: RemoteAccessPolicy;
  private projectBinding?: RemoteProjectBinding;
  private controller?: AbortController;
  private readonly runtimes = new Map<string, RuntimeBundle>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly sessionShellGrants = new Set<string>();
  private statusText = "disconnected";

  constructor(private readonly options: WeChatOpenClawRemoteControlOptions) {}

  async login(): Promise<void> {
    this.ensureInitialized();
    await this.client!.login();
    this.updateStatus(this.client!.status());
  }

  async start(): Promise<void> {
    if (this.controller) return;
    this.ensureInitialized();
    if (!this.remoteConfig!.enabled) throw new Error("WeChat OpenClaw remote control is disabled by environment.");
    if (!this.client!.currentAccount()) {
      await this.login();
    }
    this.controller = new AbortController();
    this.updateStatus("connected");
    void this.client!.poll((message) => this.handleIncoming(message), this.controller.signal)
      .finally(() => {
        if (this.controller?.signal.aborted) return;
        this.updateStatus("disconnected");
        this.controller = undefined;
      });
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    this.controller = undefined;
    for (const active of this.activeRuns.values()) {
      active.engine.cancelActiveRun("wechat openclaw remote stopped");
    }
    this.activeRuns.clear();
    this.pendingApprovals.clear();
    for (const runtime of this.runtimes.values()) {
      if (!runtime.closeWithService) continue;
      try {
        runtime.state.close();
      } catch {
        // ignore shutdown races
      }
    }
    this.runtimes.clear();
    this.updateStatus("disconnected");
  }

  status(): string {
    return this.statusText;
  }

  private ensureInitialized(): void {
    if (this.client) return;
    this.remoteConfig = readWeChatOpenClawConfig(this.options.baseConfig);
    this.accessPolicy = new RemoteAccessPolicy({
      allowedUsers: this.remoteConfig.allowedUsers,
      allowedGroups: this.remoteConfig.allowedGroups,
      botMentionNames: this.remoteConfig.mentionNames,
    });
    this.projectBinding = new RemoteProjectBinding(this.options.baseState, {
      defaultProjectPath: this.options.baseConfig.projectPath,
      allowedRoots: this.remoteConfig.projectRoots,
    });
    this.client = new OpenClawWeixinClient({
      dataDir: this.options.baseConfig.dataDir,
      config: this.remoteConfig,
      onStatus: (line) => this.updateStatus(line),
    });
    this.runtimes.set(path.resolve(this.options.baseConfig.projectPath), {
      config: this.options.baseConfig,
      state: this.options.baseState,
      provider: this.options.baseProvider,
      closeWithService: false,
    });
    this.updateStatus(this.client.status());
  }

  private updateStatus(status: string): void {
    this.statusText = status;
    this.options.onStatus?.(`[wechat] ${status}`);
  }

  private async handleIncoming(raw: OpenClawMessage): Promise<void> {
    const message = await this.remoteMessage(raw);
    const approvalHandled = await this.tryHandleNumericApproval(message);
    if (approvalHandled) return;

    const decision = this.accessPolicy?.canReceive(message) ?? { allowed: false, reason: "not_initialized" };
    if (!decision.allowed) {
      if (decision.reason !== "group_message_not_addressed") {
        await this.sendText(message, "未授权。请联系本机用户配置个人微信白名单。");
      }
      return;
    }

    const command = parseRemoteCommand(message.text, this.remoteConfig?.mentionNames ?? []);
    try {
      if (command.kind === "help") {
        await this.sendText(message, helpText());
        return;
      }
      if (command.kind === "status") {
        await this.sendText(message, this.statusReply(message.chatId));
        return;
      }
      if (command.kind === "project") {
        await this.handleProjectCommand(message, command.arg);
        return;
      }
      if (command.kind === "artifacts") {
        await this.sendText(message, this.artifactsReply(message.chatId));
        return;
      }
      if (command.kind === "usage") {
        await this.sendText(message, this.usageReply(message.chatId));
        return;
      }
      if (command.kind === "stop") {
        await this.stopRun(message);
        return;
      }
      const prompt = command.kind === "continue"
        ? "继续上一轮任务。先读取当前项目状态和最近产物，再继续完成未完成工作。"
        : command.arg;
      await this.runPrompt(message, prompt);
    } catch (error) {
      await this.sendText(message, `处理失败：${compactOneLine(errorMessage(error), 800)}`);
    }
  }

  private async tryHandleNumericApproval(message: RemoteMessage): Promise<boolean> {
    const approval = this.pendingApprovals.get(message.chatId);
    if (!approval) return false;
    const value = message.text.trim();
    if (!["1", "2", "3", "4"].includes(value)) return false;
    const runtime = this.runtimeFor(approval.projectPath);
    if (value === "4") {
      this.activeRuns.get(message.chatId)?.engine.cancelActiveRun("cancelled from WeChat");
      this.activeRuns.delete(message.chatId);
      this.pendingApprovals.delete(message.chatId);
      await this.sendText(message, "已停止当前任务。");
      return true;
    }
    if (value === "2") {
      this.sessionShellGrants.add(sessionGrantKey(message.chatId, approval.projectPath));
      const active = this.activeRuns.get(message.chatId);
      if (active && path.resolve(active.projectPath) === path.resolve(approval.projectPath)) {
        active.permissions.allowShell = true;
        active.permissions.profile = "custom";
      }
    }
    const status = value === "3" ? "rejected" : "approved";
    new ApprovalService(runtime.state).decide(approval.gateId, status, `wechat-openclaw:${value}`);
    this.pendingApprovals.delete(message.chatId);
    await this.sendText(
      message,
      status === "approved"
        ? "权限已允许，任务会继续执行。"
        : "权限已拒绝，任务会收到拒绝结果并继续判断下一步。",
    );
    return true;
  }

  private async runPrompt(message: RemoteMessage, prompt: string): Promise<void> {
    if (!prompt.trim()) {
      await this.sendText(message, "请输入任务内容。发送 /help 查看可用命令。");
      return;
    }
    if (this.activeRuns.has(message.chatId)) {
      await this.sendText(message, "当前会话已有任务运行中。发送 /stop 可停止，或等待完成后再继续。");
      return;
    }
    const projectPath = this.currentProject(message.chatId);
    const runtime = this.runtimeFor(projectPath);
    if (!runtime.provider) {
      await this.sendText(message, "DeepSeek provider 未配置。请在项目 .env 中配置 DEEPSEEK_API_KEY 后重试。");
      return;
    }

    await this.sendText(message, "已收到，正在处理...");
    const permissions = this.permissionsFor(message.chatId, projectPath);
    const engine = new QueryEngine({
      config: runtime.config,
      state: runtime.state,
      provider: runtime.provider,
      permissions,
      awaitUserDecisions: true,
      sessionPersistence: "managed",
      sessionScopeProjectPath: `${path.resolve(projectPath)}#remote:wechat-openclaw:${this.client?.currentAccount()?.accountId ?? "unknown"}:${message.chatId}`,
    });
    const active: ActiveRun = {
      engine,
      renderer: new RemoteReplyRenderer(runtime.config.model),
      permissions,
      projectPath,
      contextToken: String((message.raw as OpenClawMessage | undefined)?.context_token ?? ""),
      replyTarget: replyTargetFromRaw(message.raw as OpenClawMessage | undefined),
    };
    this.activeRuns.set(message.chatId, active);
    runtime.state.appendEvent(null, "remote_wechat_prompt", {
      chat_id: message.chatId,
      user_id: message.userId,
      project_path: projectPath,
      prompt_preview: compactOneLine(prompt, 200),
    });

    let lastProgressAt = 0;
    const sentGates = new Set<string>();
    try {
      for await (const event of engine.submit(prompt)) {
        active.runId = active.runId ?? runtime.state.listRuns(1)[0]?.id;
        const progress = active.renderer.accept(event);
        await this.maybeSendApproval(message, active, runtime.state, sentGates);
        if (progress && Date.now() - lastProgressAt > 2500) {
          await this.sendText(message, progress);
          lastProgressAt = Date.now();
        }
      }
      active.runId = active.runId ?? runtime.state.listRuns(1)[0]?.id;
      const final = active.renderer.final({
        stateStore: runtime.state,
        runId: active.runId,
        projectPath,
      });
      await this.sendText(message, final);
      await this.sendArtifactSummary(message, runtime, active.runId);
    } catch (error) {
      await this.sendText(message, `任务异常：${compactOneLine(errorMessage(error), 1000)}`);
    } finally {
      this.activeRuns.delete(message.chatId);
    }
  }

  private async maybeSendApproval(
    message: RemoteMessage,
    active: ActiveRun,
    state: StateStore,
    sentGates: Set<string>,
  ): Promise<void> {
    if (!active.runId) return;
    const pending = state.listApprovalGates({ runId: active.runId, status: "pending" }, 10)[0];
    if (!pending || sentGates.has(pending.id)) return;
    sentGates.add(pending.id);
    this.pendingApprovals.set(message.chatId, {
      chatId: message.chatId,
      projectPath: active.projectPath,
      runId: active.runId,
      gateId: pending.id,
      summary: pending.summary,
    });
    await this.sendText(message, [
      `权限请求：${compactOneLine(pending.summary, 600)}`,
      `项目：${active.projectPath}`,
      "",
      "回复数字选择：",
      "1 允许一次",
      "2 本会话允许",
      "3 拒绝",
      "4 停止任务",
    ].join("\n"));
  }

  private async remoteMessage(raw: OpenClawMessage): Promise<RemoteMessage> {
    const chatId = remoteChatId(raw);
    const attachments: RemoteAttachment[] = [];
    for (const [index, item] of (raw.item_list ?? []).entries()) {
      if (item.type === 1 || item.type === 3) continue;
      const kind = attachmentKind(item);
      if (!kind || !this.client) continue;
      try {
        const saved = await this.client.saveInboundMedia(item, inboxRoot(this.options.baseConfig.dataDir, chatId), `${kind}-${index}`);
        attachments.push({
          kind,
          filename: path.basename(saved.path),
          path: saved.path,
          bytes: saved.bytes,
        });
      } catch {
        // Keep processing the text part even when an attachment download fails.
      }
    }
    const text = messageText(raw);
    const attachmentNote = attachments.length
      ? `\n\n微信附件已保存：\n${attachments.map((item) => `- ${item.path}`).join("\n")}`
      : "";
    return {
      channel: "wechat-openclaw",
      messageId: String(raw.msgid ?? raw.message_id ?? `${Date.now()}`),
      chatId,
      userId: raw.from_user_id ?? "unknown",
      isGroup: Boolean(raw.group_id),
      text: `${text}${attachmentNote}`.trim(),
      attachments: attachments.length ? attachments : undefined,
      receivedAtMs: Date.now(),
      raw,
    };
  }

  private currentProject(chatId: string): string {
    if (!this.projectBinding) return path.resolve(this.options.baseConfig.projectPath);
    return this.projectBinding.current(chatId);
  }

  private runtimeFor(projectPath: string): RuntimeBundle {
    const resolved = path.resolve(projectPath);
    const existing = this.runtimes.get(resolved);
    if (existing) return existing;
    const config = bootstrapConfig({
      project: resolved,
      model: this.options.baseConfig.model,
      allowShell: this.options.baseConfig.shellEnabled,
      allowBrowser: this.options.baseConfig.browserEnabled,
      permissionProfile: this.options.baseConfig.permissionProfile,
    });
    const state = new StateStore(config.stateDbPath);
    const provider = config.provider ? new DeepSeekClient(config.provider) : null;
    const runtime = { config, state, provider, closeWithService: true };
    this.runtimes.set(resolved, runtime);
    return runtime;
  }

  private permissionsFor(chatId: string, projectPath: string): RuntimePermissionState {
    const allowShell = this.options.permissions.allowShell || this.sessionShellGrants.has(sessionGrantKey(chatId, projectPath));
    return {
      ...this.options.permissions,
      allowShell,
      profile: allowShell === this.options.permissions.allowShell ? this.options.permissions.profile : "custom",
    };
  }

  private async handleProjectCommand(message: RemoteMessage, arg: string): Promise<void> {
    if (!this.projectBinding) {
      await this.sendText(message, "远程项目绑定尚未初始化。");
      return;
    }
    if (!arg.trim()) {
      await this.sendText(message, `当前项目：${this.projectBinding.current(message.chatId)}\n允许目录：${this.projectBinding.allowedRoots().join("; ")}`);
      return;
    }
    const bound = this.projectBinding.bind(message.chatId, arg.trim());
    this.runtimeFor(bound);
    await this.sendText(message, `已切换远程项目：${bound}`);
  }

  private statusReply(chatId: string): string {
    const projectPath = this.currentProject(chatId);
    const runtime = this.runtimeFor(projectPath);
    const run = runtime.state.listRuns(1)[0];
    return [
      "## DeepSeekCode 个人微信远程状态",
      `连接：${this.status()}`,
      `项目：${projectPath}`,
      `模型：${runtime.config.model}`,
      `shell：${this.permissionsFor(chatId, projectPath).allowShell ? "on" : "off"}`,
      run ? `最近任务：${run.status} ${run.id}` : "最近任务：暂无",
    ].join("\n");
  }

  private artifactsReply(chatId: string): string {
    const runtime = this.runtimeFor(this.currentProject(chatId));
    const run = runtime.state.listRuns(1)[0];
    if (!run) return "暂无任务产物。";
    const trace = runtime.state.traceRun(run.id) as { artifacts?: Array<{ path?: string; kind?: string }> };
    const artifacts = (trace.artifacts ?? []).map((artifact) => `- ${artifact.path}${artifact.kind ? ` (${artifact.kind})` : ""}`);
    return artifacts.length ? ["## 最近产物", ...artifacts.slice(-12)].join("\n") : "最近任务没有记录到产物。";
  }

  private usageReply(chatId: string): string {
    const runtime = this.runtimeFor(this.currentProject(chatId));
    const run = runtime.state.listRuns(1)[0];
    const usage = run ? runtime.state.usageTotals(run.id) : runtime.state.usageTotals();
    return [
      "## 使用量",
      `输入：${usage.inputTokens}`,
      `输出：${usage.outputTokens}`,
      `缓存命中：${usage.cacheHitTokens}`,
      `缓存未命中：${usage.cacheMissTokens}`,
      `快照：${usage.snapshots}`,
    ].join("\n");
  }

  private async stopRun(message: RemoteMessage): Promise<void> {
    const active = this.activeRuns.get(message.chatId);
    if (!active) {
      await this.sendText(message, "当前会话没有运行中的任务。");
      return;
    }
    active.engine.cancelActiveRun("stopped from WeChat");
    this.activeRuns.delete(message.chatId);
    await this.sendText(message, "已请求停止当前任务。");
  }

  private async sendArtifactSummary(message: RemoteMessage, runtime: RuntimeBundle, runId: string | undefined): Promise<void> {
    if (!runId) return;
    const trace = runtime.state.traceRun(runId) as { artifacts?: Array<{ path?: string; kind?: string }> };
    const artifacts = (trace.artifacts ?? [])
      .map((artifact) => artifact.path)
      .filter((value): value is string => Boolean(value))
      .slice(-5);
    const existing = artifacts.filter((artifactPath) => {
      const fullPath = path.isAbsolute(artifactPath) ? artifactPath : path.join(runtime.config.projectPath, artifactPath);
      return fs.existsSync(fullPath);
    });
    if (existing.length) {
      await this.sendText(message, ["最近产物路径：", ...existing.map((item) => `- ${item}`)].join("\n"));
    }
  }

  private async sendText(message: RemoteMessage, text: string): Promise<void> {
    const active = this.activeRuns.get(message.chatId);
    const raw = message.raw as OpenClawMessage | undefined;
    const target = active?.replyTarget || replyTargetFromRaw(raw);
    const contextToken = active?.contextToken || String(raw?.context_token ?? "");
    await this.client?.sendText(target, redactRemoteText(text, 4500), contextToken);
  }
}

let sharedService: WeChatOpenClawRemoteControlService | undefined;

export function getSharedWeChatOpenClawRemoteControlService(
  options: WeChatOpenClawRemoteControlOptions,
): WeChatOpenClawRemoteControlService {
  if (!sharedService) {
    sharedService = new WeChatOpenClawRemoteControlService(options);
  }
  return sharedService;
}

export async function stopSharedWeChatOpenClawRemoteControlService(): Promise<void> {
  await sharedService?.stop();
  sharedService = undefined;
}

function parseRemoteCommand(text: string, mentionNames: string[]): { kind: string; arg: string } {
  const trimmed = stripMention(text.trim(), mentionNames);
  if (!trimmed) return { kind: "run", arg: "" };
  const match = trimmed.match(/^\/([a-zA-Z-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return { kind: "run", arg: trimmed };
  const name = match[1].toLowerCase();
  const arg = match[2] ?? "";
  if (["help", "status", "project", "artifacts", "usage", "stop", "continue"].includes(name)) {
    return { kind: name, arg };
  }
  if (name === "run") return { kind: "run", arg };
  return { kind: "run", arg: trimmed };
}

function stripMention(text: string, mentionNames: string[]): string {
  let value = text;
  for (const name of mentionNames) {
    const mention = name.trim();
    if (!mention) continue;
    value = value.replace(new RegExp(`^@${escapeRegExp(mention)}\\s*`, "i"), "");
  }
  return value.trim();
}

function helpText(): string {
  return [
    "## DeepSeekCode 个人微信远程控制",
    "/status 查看状态",
    "/project 查看当前项目",
    "/project D:\\code\\Project 切换项目",
    "/run <任务> 执行任务",
    "/continue 继续上次任务",
    "/artifacts 查看产物",
    "/usage 查看用量",
    "/stop 停止当前任务",
    "",
    "也可以直接发送自然语言任务。群聊中请 @DeepSeekCode 或使用 /run。",
  ].join("\n");
}

function remoteChatId(message: OpenClawMessage): string {
  return message.group_id || message.session_id || message.from_user_id || "unknown";
}

function replyTargetFromRaw(message: OpenClawMessage | undefined): string {
  return message?.group_id || message?.from_user_id || message?.session_id || message?.to_user_id || "unknown";
}

function messageText(message: OpenClawMessage): string {
  return (message.item_list ?? [])
    .map((item) => item.text_item?.text || item.voice_item?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function attachmentKind(item: OpenClawMessageItem): RemoteAttachment["kind"] | undefined {
  if (item.image_item || item.type === 2) return "image";
  if (item.voice_item || item.type === 3) return "voice";
  if (item.file_item || item.type === 4) return "file";
  if (item.video_item || item.type === 5) return "video";
  return undefined;
}

function sessionGrantKey(chatId: string, projectPath: string): string {
  return `${chatId}:${path.resolve(projectPath)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
