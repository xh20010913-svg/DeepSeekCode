import fs from "node:fs";
import path from "node:path";
import {
  WSClient,
  generateReqId,
  type FileMessage,
  type ImageMessage,
  type TemplateCardEventData,
  type TextMessage,
  type VideoMessage,
  type VoiceMessage,
  type WeComMediaType,
  type WsFrame,
} from "@wecom/aibot-node-sdk";
import { bootstrapConfig, type RuntimeConfig } from "../../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import { QueryEngine, type QueryEvent } from "../../query/QueryEngine.js";
import { ApprovalService } from "../../services/approval/approvalService.js";
import { DeepSeekClient } from "../../services/deepseek/client.js";
import type { RuntimePermissionState } from "../../services/permissions/permissionProfiles.js";
import { StateStore } from "../../state/sqlite.js";
import { RemoteAccessPolicy } from "../accessPolicy.js";
import { RemoteProjectBinding } from "../projectBinding.js";
import { compactOneLine, redactRemoteText } from "../redact.js";
import { RemoteReplyRenderer } from "../renderer.js";
import type { RemoteAttachment, RemoteChannel, RemoteMessage } from "../types.js";
import { approvalCard, decidedCard } from "./cards.js";
import { readWeComRemoteConfig, type WeComRemoteConfig } from "./config.js";

type WeComMessageFrame = WsFrame<TextMessage | ImageMessage | FileMessage | VoiceMessage | VideoMessage>;
type WeComTemplateEventFrame = WsFrame<{
  msgid: string;
  chatid?: string;
  chattype?: "single" | "group";
  from?: { userid?: string };
  event: TemplateCardEventData;
}>;

interface RuntimeBundle {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
  closeWithService: boolean;
}

interface ActiveRun {
  engine: QueryEngine;
  streamId: string;
  renderer: RemoteReplyRenderer;
  permissions: RuntimePermissionState;
  projectPath: string;
  runId?: string;
}

interface GateIndexEntry {
  chatId: string;
  projectPath: string;
  runId: string;
  summary: string;
}

export interface WeComRemoteControlOptions {
  baseConfig: RuntimeConfig;
  baseState: StateStore;
  baseProvider: DeepSeekProviderClient | null;
  permissions: RuntimePermissionState;
  onStatus?: (line: string) => void;
}

export class WeComRemoteControlService implements RemoteChannel {
  readonly name = "wecom" as const;

  private client?: WSClient;
  private remoteConfig?: WeComRemoteConfig;
  private accessPolicy?: RemoteAccessPolicy;
  private projectBinding?: RemoteProjectBinding;
  private readonly runtimes = new Map<string, RuntimeBundle>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly gateIndex = new Map<string, GateIndexEntry>();
  private readonly sessionShellGrants = new Set<string>();
  private statusText = "disconnected";
  private stopped = false;

  constructor(private readonly options: WeComRemoteControlOptions) {}

  async start(): Promise<void> {
    if (this.client) return;
    this.stopped = false;
    this.remoteConfig = readWeComRemoteConfig(this.options.baseConfig);
    this.accessPolicy = new RemoteAccessPolicy({
      allowedUsers: this.remoteConfig.allowedUsers,
      allowedGroups: this.remoteConfig.allowedGroups,
      botMentionNames: this.remoteConfig.botMentionNames,
    });
    this.projectBinding = new RemoteProjectBinding(this.options.baseState, {
      defaultProjectPath: this.options.baseConfig.projectPath,
      allowedRoots: this.remoteConfig.projectRoots,
    });
    this.runtimes.set(path.resolve(this.options.baseConfig.projectPath), {
      config: this.options.baseConfig,
      state: this.options.baseState,
      provider: this.options.baseProvider,
      closeWithService: false,
    });

    this.client = new WSClient({
      botId: this.remoteConfig.botId,
      secret: this.remoteConfig.secret,
      wsUrl: this.remoteConfig.wsUrl,
      maxReconnectAttempts: -1,
      maxAuthFailureAttempts: 5,
      logger: silentLogger(),
    });

    this.client.on("connected", () => this.updateStatus("connecting"));
    this.client.on("authenticated", () => this.updateStatus("connected"));
    this.client.on("reconnecting", (attempt) => this.updateStatus(`reconnecting(${attempt})`));
    this.client.on("disconnected", (reason) => this.updateStatus(`disconnected: ${reason}`));
    this.client.on("error", (error) => this.updateStatus(`error: ${error.message}`));
    this.client.on("message.text", (frame) => void this.handleText(frame));
    this.client.on("message.file", (frame) => void this.handleAttachment(frame, "file"));
    this.client.on("message.image", (frame) => void this.handleAttachment(frame, "image"));
    this.client.on("message.voice", (frame) => void this.handleText(frame as unknown as WsFrame<TextMessage>));
    this.client.on("message.video", (frame) => void this.handleAttachment(frame, "video"));
    this.client.on("event.template_card_event", (frame) => void this.handleTemplateCardEvent(frame));
    this.client.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const active of this.activeRuns.values()) {
      active.engine.cancelActiveRun("wecom remote stopped");
    }
    this.activeRuns.clear();
    this.gateIndex.clear();
    this.client?.disconnect();
    this.client = undefined;
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

  private updateStatus(status: string): void {
    this.statusText = status;
    this.options.onStatus?.(`[wecom] ${status}`);
  }

  private async handleText(frame: WsFrame<TextMessage>): Promise<void> {
    const message = this.remoteMessage(frame);
    const decision = this.accessPolicy?.canReceive(message) ?? { allowed: false, reason: "not_initialized" };
    if (!decision.allowed) {
      if (decision.reason !== "group_message_not_addressed") {
        await this.replyFinal(frame, "未授权，联系本机用户配置企业微信白名单。");
      }
      return;
    }

    const command = parseRemoteCommand(message.text, this.remoteConfig?.botMentionNames ?? []);
    try {
      if (command.kind === "help") {
        await this.replyFinal(frame, helpText());
        return;
      }
      if (command.kind === "status") {
        await this.replyFinal(frame, this.statusReply(message.chatId));
        return;
      }
      if (command.kind === "project") {
        await this.handleProjectCommand(frame, message.chatId, command.arg);
        return;
      }
      if (command.kind === "artifacts") {
        await this.replyFinal(frame, this.artifactsReply(message.chatId));
        return;
      }
      if (command.kind === "usage") {
        await this.replyFinal(frame, this.usageReply(message.chatId));
        return;
      }
      if (command.kind === "stop") {
        await this.stopRun(frame, message.chatId);
        return;
      }
      const prompt = command.kind === "continue"
        ? "继续上一轮任务。先读取当前项目状态和最近产物，然后继续完成未完成工作。"
        : command.arg;
      await this.runPrompt(frame, message, prompt);
    } catch (error) {
      await this.replyFinal(frame, `处理失败：${compactOneLine(errorMessage(error), 800)}`);
    }
  }

  private async handleAttachment(frame: WeComMessageFrame, kind: RemoteAttachment["kind"]): Promise<void> {
    const message = this.remoteMessage(frame);
    const decision = this.accessPolicy?.canReceive(message) ?? { allowed: false, reason: "not_initialized" };
    if (!decision.allowed) {
      if (decision.reason !== "group_message_not_addressed") {
        await this.replyFinal(frame, "未授权，联系本机用户配置企业微信白名单。");
      }
      return;
    }
    try {
      const projectPath = this.currentProject(message.chatId);
      const runtime = this.runtimeFor(projectPath);
      const attachment = await this.saveAttachment(frame, kind, runtime.config.dataDir, message.chatId);
      const prompt = message.text.trim()
        ? `${message.text}\n\n微信附件已保存：${attachment.path}`
        : `微信用户上传了一个${kind === "image" ? "图片" : "文件"}附件，路径：${attachment.path}。请先说明你已收到，并等待用户下一步指令；如果用户意图明确，可以读取该文件继续处理。`;
      await this.runPrompt(frame, { ...message, attachments: [attachment] }, prompt);
    } catch (error) {
      await this.replyFinal(frame, `附件保存失败：${compactOneLine(errorMessage(error), 800)}`);
    }
  }

  private async handleTemplateCardEvent(frame: WeComTemplateEventFrame): Promise<void> {
    if (!frame.body) return;
    const event = frame.body.event;
    const key = event.event_key ?? "";
    const taskId = event.task_id ?? "";
    const [action, value] = key.split(":", 2);
    const gateId = value || taskId;
    const indexed = this.gateIndex.get(gateId);
    const chatId = indexed?.chatId ?? conversationId(frame.body);
    const runtime = indexed ? this.runtimeFor(indexed.projectPath) : this.findRuntimeWithGate(gateId);

    try {
      if (action === "cancel") {
        const targetRunId = value || taskId;
        for (const [activeChatId, active] of this.activeRuns.entries()) {
          if (active.runId === targetRunId) {
            active.engine.cancelActiveRun("cancelled from WeCom");
            this.activeRuns.delete(activeChatId);
            break;
          }
        }
        await this.updateCard(frame, taskId || gateId, "cancelled", "任务已停止");
        await this.sendMessage(chatId, "已停止当前远程任务。");
        return;
      }

      if (!runtime) {
        await this.updateCard(frame, taskId || gateId, "rejected", "审批请求已过期");
        return;
      }
      if (!["approve_once", "approve_session", "reject"].includes(action)) {
        await this.updateCard(frame, taskId || gateId, "rejected", "未知审批操作");
        await this.sendMessage(chatId, "未知审批操作，任务不会继续执行该工具。");
        return;
      }

      const approval = new ApprovalService(runtime.state);
      if (action === "approve_session") {
        this.sessionShellGrants.add(sessionGrantKey(chatId, runtime.config.projectPath));
        const active = this.activeRuns.get(chatId);
        if (active && path.resolve(active.projectPath) === path.resolve(runtime.config.projectPath)) {
          active.permissions.allowShell = true;
          active.permissions.profile = "custom";
        }
      }
      const status = action === "reject" ? "rejected" : "approved";
      approval.decide(gateId, status, `wecom:${action}`);
      await this.updateCard(frame, taskId || gateId, status, status === "approved" ? "已确认，任务会继续执行" : "已拒绝，任务会收到拒绝结果");
      await this.sendMessage(chatId, status === "approved" ? "权限已允许，任务继续执行。" : "权限已拒绝，任务会收到拒绝结果。");
    } catch (error) {
      await this.updateCard(frame, taskId || gateId, "rejected", compactOneLine(errorMessage(error), 120));
    }
  }

  private async runPrompt(frame: WeComMessageFrame, message: RemoteMessage, prompt: string): Promise<void> {
    if (!prompt.trim()) {
      await this.replyFinal(frame, "请输入任务内容。发送 /help 查看可用命令。");
      return;
    }
    if (this.activeRuns.has(message.chatId)) {
      await this.replyFinal(frame, "当前会话已有任务运行中。发送 /stop 可停止，或等待完成后再继续。");
      return;
    }
    const projectPath = this.currentProject(message.chatId);
    const runtime = this.runtimeFor(projectPath);
    if (!runtime.provider) {
      await this.replyFinal(frame, "DeepSeek provider 未配置。请在项目 .env 中配置 DEEPSEEK_API_KEY 后重试。");
      return;
    }

    const streamId = generateReqId("dsc_stream");
    await this.client?.replyStream(frame, streamId, "已收到，正在处理...", false);

    const permissions = this.permissionsFor(message.chatId, projectPath);
    const engine = new QueryEngine({
      config: runtime.config,
      state: runtime.state,
      provider: runtime.provider,
      permissions,
      awaitUserDecisions: true,
      sessionPersistence: "managed",
      sessionScopeProjectPath: `${path.resolve(projectPath)}#remote:wecom:${message.chatId}`,
    });
    const active: ActiveRun = {
      engine,
      streamId,
      renderer: new RemoteReplyRenderer(runtime.config.model),
      permissions,
      projectPath,
    };
    this.activeRuns.set(message.chatId, active);
    runtime.state.appendEvent(null, "remote_wecom_prompt", {
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
        await this.maybeSendApproval(frame, active, runtime.state, sentGates);
        if (progress && Date.now() - lastProgressAt > 2000) {
          await this.safeReplyStream(frame, active.streamId, progress, false);
          lastProgressAt = Date.now();
        }
      }
      active.runId = active.runId ?? runtime.state.listRuns(1)[0]?.id;
      const final = active.renderer.final({
        stateStore: runtime.state,
        runId: active.runId,
        projectPath,
      });
      await this.safeReplyStream(frame, active.streamId, final, true);
      await this.sendRecentArtifactFiles(message.chatId, runtime, active.runId);
    } catch (error) {
      const final = `任务异常：${compactOneLine(errorMessage(error), 1000)}`;
      await this.safeReplyStream(frame, active.streamId, final, true);
    } finally {
      this.activeRuns.delete(message.chatId);
    }
  }

  private async maybeSendApproval(
    frame: WeComMessageFrame,
    active: ActiveRun,
    state: StateStore,
    sentGates: Set<string>,
  ): Promise<void> {
    if (!active.runId) return;
    if (!frame.body) return;
    const pending = state.listApprovalGates({ runId: active.runId, status: "pending" }, 10)[0];
    if (!pending || sentGates.has(pending.id)) return;
    sentGates.add(pending.id);
    this.gateIndex.set(pending.id, {
      chatId: conversationId(frame.body),
      projectPath: active.projectPath,
      runId: active.runId,
      summary: pending.summary,
    });
    await this.client?.replyTemplateCard(frame, approvalCard({
      gateId: pending.id,
      runId: active.runId,
      summary: pending.summary,
      projectPath: active.projectPath,
    }));
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
      allowBrowser: this.options.permissions.allowBrowser,
      profile: allowShell === this.options.permissions.allowShell ? this.options.permissions.profile : "custom",
    };
  }

  private remoteMessage(frame: WeComMessageFrame): RemoteMessage {
    const body = frame.body ?? {
      msgid: frame.headers.req_id ?? generateReqId("msg"),
      aibotid: "",
      chattype: "single" as const,
      from: { userid: "unknown" },
      msgtype: "text",
      text: { content: "" },
    };
    const text =
      "text" in body ? body.text?.content ?? "" :
      "voice" in body ? body.voice?.content ?? "" :
      "";
    return {
      channel: "wecom",
      messageId: String(body.msgid ?? frame.headers.req_id ?? generateReqId("msg")),
      chatId: conversationId(body),
      userId: body.from?.userid ?? "unknown",
      isGroup: body.chattype === "group",
      text,
      receivedAtMs: Date.now(),
      raw: body,
    };
  }

  private async saveAttachment(
    frame: WeComMessageFrame,
    kind: RemoteAttachment["kind"],
    dataDir: string,
    chatId: string,
  ): Promise<RemoteAttachment> {
    const body = frame.body as ImageMessage | FileMessage | VideoMessage;
    const payload =
      "image" in body ? body.image :
      "file" in body ? body.file :
      "video" in body ? body.video :
      undefined;
    if (!payload?.url) throw new Error("attachment url missing");
    const downloaded = await this.client!.downloadFile(payload.url, payload.aeskey);
    const filename = safeFilename(downloaded.filename ?? `${kind}-${Date.now()}`);
    const inboxDir = path.join(dataDir, "remote", "inbox", safeFilename(chatId));
    fs.mkdirSync(inboxDir, { recursive: true });
    const target = path.join(inboxDir, `${Date.now()}-${filename}`);
    fs.writeFileSync(target, downloaded.buffer);
    return {
      kind,
      filename,
      path: target,
      bytes: downloaded.buffer.length,
    };
  }

  private async sendRecentArtifactFiles(chatId: string, runtime: RuntimeBundle, runId: string | undefined): Promise<void> {
    if (!runId || !this.client) return;
    const trace = runtime.state.traceRun(runId) as { artifacts?: Array<{ path?: string; kind?: string }> };
    const artifacts = (trace.artifacts ?? [])
      .map((artifact) => artifact.path)
      .filter((value): value is string => Boolean(value))
      .slice(-3);
    for (const artifactPath of artifacts) {
      const fullPath = path.isAbsolute(artifactPath)
        ? artifactPath
        : path.join(runtime.config.projectPath, artifactPath);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size > 45 * 1024 * 1024) continue;
      const mediaType = mediaTypeForPath(fullPath);
      if (!mediaType) continue;
      try {
        const media = await this.client.uploadMedia(fs.readFileSync(fullPath), {
          type: mediaType,
          filename: path.basename(fullPath),
        });
        await this.client.sendMediaMessage(chatId, mediaType, media.media_id);
      } catch (error) {
        await this.sendMessage(chatId, `产物上传失败：${path.basename(fullPath)}，${compactOneLine(errorMessage(error), 120)}`);
      }
    }
  }

  private async handleProjectCommand(frame: WeComMessageFrame, chatId: string, arg: string): Promise<void> {
    if (!this.projectBinding) {
      await this.replyFinal(frame, "远程项目绑定尚未初始化。");
      return;
    }
    if (!arg.trim()) {
      await this.replyFinal(frame, `当前项目：${this.projectBinding.current(chatId)}\n允许目录：${this.projectBinding.allowedRoots().join("; ")}`);
      return;
    }
    const bound = this.projectBinding.bind(chatId, arg.trim());
    this.runtimeFor(bound);
    await this.replyFinal(frame, `已切换远程项目：${bound}`);
  }

  private statusReply(chatId: string): string {
    const projectPath = this.currentProject(chatId);
    const runtime = this.runtimeFor(projectPath);
    const run = runtime.state.listRuns(1)[0];
    return [
      "## DeepSeekCode 远程状态",
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

  private async stopRun(frame: WeComMessageFrame, chatId: string): Promise<void> {
    const active = this.activeRuns.get(chatId);
    if (!active) {
      await this.replyFinal(frame, "当前会话没有运行中的任务。");
      return;
    }
    active.engine.cancelActiveRun("stopped from WeCom");
    this.activeRuns.delete(chatId);
    await this.replyFinal(frame, "已请求停止当前任务。");
  }

  private findRuntimeWithGate(gateId: string): RuntimeBundle | undefined {
    for (const runtime of this.runtimes.values()) {
      const gate = runtime.state.listApprovalGates({}, 100).find((candidate) => candidate.id === gateId);
      if (gate) return runtime;
    }
    return undefined;
  }

  private async updateCard(
    frame: WeComTemplateEventFrame,
    taskId: string,
    status: "approved" | "rejected" | "cancelled",
    summary: string,
  ): Promise<void> {
    await this.client?.updateTemplateCard(frame, decidedCard({ taskId, status, summary }));
  }

  private async replyFinal(frame: WeComMessageFrame, text: string): Promise<void> {
    const streamId = generateReqId("dsc_stream");
    await this.safeReplyStream(frame, streamId, text, true);
  }

  private async safeReplyStream(frame: WeComMessageFrame, streamId: string, text: string, finish: boolean): Promise<void> {
    try {
      await this.client?.replyStream(frame, streamId, redactRemoteText(text, 4500), finish);
    } catch (error) {
      this.updateStatus(`reply failed: ${errorMessage(error)}`);
    }
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    await this.client?.sendMessage(chatId, {
      msgtype: "markdown",
      markdown: { content: redactRemoteText(text, 4500) },
    });
  }
}

let sharedService: WeComRemoteControlService | undefined;

export function getSharedWeComRemoteControlService(options: WeComRemoteControlOptions): WeComRemoteControlService {
  if (!sharedService) {
    sharedService = new WeComRemoteControlService(options);
  }
  return sharedService;
}

export async function stopSharedWeComRemoteControlService(): Promise<void> {
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
    "## DeepSeekCode 企微远程控制",
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

function conversationId(body: { chatid?: string; from?: { userid?: string } }): string {
  return body.chatid ?? body.from?.userid ?? "unknown";
}

function sessionGrantKey(chatId: string, projectPath: string): string {
  return `${chatId}:${path.resolve(projectPath)}`;
}

function mediaTypeForPath(filePath: string): WeComMediaType | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".avi"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".amr"].includes(ext)) return "voice";
  if ([".html", ".md", ".docx", ".pptx", ".pdf", ".xlsx", ".csv", ".txt"].includes(ext)) return "file";
  return undefined;
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "file";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function silentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}
