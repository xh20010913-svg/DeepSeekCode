import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bootstrapConfig, type RuntimeConfig } from "../../bootstrap/config.js";
import { captureBrowserScreenshot } from "../../bridge/cdpClient.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import { QueryEngine } from "../../query/QueryEngine.js";
import { ApprovalService } from "../../services/approval/approvalService.js";
import { answerAsyncQuestion } from "../../services/async/asyncQuestionService.js";
import { DeepSeekClient } from "../../services/deepseek/client.js";
import type { RuntimePermissionState } from "../../services/permissions/permissionProfiles.js";
import { getSessionHub } from "../../services/session/sessionHub.js";
import { StateStore } from "../../state/sqlite.js";
import { RemoteAccessPolicy } from "../accessPolicy.js";
import { planRemoteDelivery, type RemoteDeliveryCandidate } from "../delivery.js";
import { RemoteProjectBinding } from "../projectBinding.js";
import { captureHtmlWithHeadlessBrowser } from "../preview.js";
import { compactOneLine, redactRemoteText } from "../redact.js";
import { RemoteReplyRenderer, type RemoteFinalRender } from "../renderer.js";
import { buildRemoteStatus } from "../status.js";
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
  startedAtMs: number;
  lastEventAtMs: number;
  lastEventText?: string;
}

interface PendingApproval {
  chatId: string;
  projectPath: string;
  runId: string;
  gateId: string;
  summary: string;
}

interface TraceArtifact {
  path?: string;
  kind?: string;
}

export interface WeChatOpenClawRemoteControlOptions {
  baseConfig: RuntimeConfig;
  baseState: StateStore;
  baseProvider: DeepSeekProviderClient | null;
  permissions: RuntimePermissionState;
  onStatus?: (line: string) => void;
  onRemoteUserMessage?: (line: string) => void;
  onRemoteAssistantMessage?: (line: string) => void;
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
  private readonly activeRunPromises = new Map<string, Promise<void>>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly sessionShellGrants = new Set<string>();
  private statusListener?: (line: string) => void;
  private remoteUserListener?: (line: string) => void;
  private remoteAssistantListener?: (line: string) => void;
  private statusText = "disconnected";

  constructor(private readonly options: WeChatOpenClawRemoteControlOptions) {
    this.statusListener = options.onStatus;
    this.remoteUserListener = options.onRemoteUserMessage;
    this.remoteAssistantListener = options.onRemoteAssistantMessage;
  }

  setStatusListener(listener: ((line: string) => void) | undefined): void {
    this.statusListener = listener;
  }

  setRemoteTranscriptListeners(input: {
    onRemoteUserMessage?: (line: string) => void;
    onRemoteAssistantMessage?: (line: string) => void;
  }): void {
    this.remoteUserListener = input.onRemoteUserMessage;
    this.remoteAssistantListener = input.onRemoteAssistantMessage;
  }

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
    void this.client!.poll(async (message) => {
      void this.handleIncoming(message).catch((error) => {
        this.updateStatus(`message handling failed: ${errorMessage(error)}`);
      });
    }, this.controller.signal).finally(() => {
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
    this.activeRunPromises.clear();
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
    getSessionHub().updateRemote({
      channel: this.name,
      projectPath: this.options.baseConfig.projectPath,
      status,
      updatedAtMs: Date.now(),
    });
    this.statusListener?.(`[wechat] ${status}`);
  }

  private async handleIncoming(raw: OpenClawMessage): Promise<void> {
    const message = await this.remoteMessage(raw);
    if (message.text.trim()) {
      this.remoteUserListener?.(remoteTranscriptText(message.text));
    }
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
      if (command.kind === "ask") {
        await this.answerSideQuestion(message, command.arg);
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
      if (command.kind === "shell") {
        await this.handleShellCommand(message, command.arg);
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
    const running = this.activeRuns.get(message.chatId);
    if (running) {
      await this.sendText(message, [
        "当前任务仍在运行。",
        "发送 /status 查看进度，发送 /ask <问题> 进行旁路问答，发送 /stop 停止任务。",
        "",
        this.statusReply(message.chatId),
      ].join("\n"));
      return;
    }

    const projectPath = this.currentProject(message.chatId);
    const runtime = this.runtimeFor(projectPath);
    if (!runtime.provider) {
      await this.sendText(message, "DeepSeek provider 未配置。请在项目 .env 中配置 DEEPSEEK_API_KEY 后重试。");
      return;
    }

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
      startedAtMs: Date.now(),
      lastEventAtMs: Date.now(),
    };
    this.activeRuns.set(message.chatId, active);
    runtime.state.appendEvent(null, "remote_wechat_prompt", {
      chat_id: message.chatId,
      user_id: message.userId,
      project_path: projectPath,
      prompt_preview: compactOneLine(prompt, 200),
    });

    await this.sendText(message, "已收到，开始处理。微信端只会推送关键进度、权限请求和最终结果。");
    const task = this.executePrompt(message, runtime, active, prompt)
      .finally(() => {
        this.activeRuns.delete(message.chatId);
        this.activeRunPromises.delete(message.chatId);
      });
    this.activeRunPromises.set(message.chatId, task);
  }

  private async executePrompt(
    message: RemoteMessage,
    runtime: RuntimeBundle,
    active: ActiveRun,
    prompt: string,
  ): Promise<void> {
    let lastProgressAt = 0;
    const sentGates = new Set<string>();
    try {
      for await (const event of active.engine.submit(prompt)) {
        active.runId = active.runId ?? runtime.state.listRuns(1)[0]?.id;
        active.lastEventAtMs = Date.now();
        active.lastEventText = event.type === "status"
          ? `${event.text}${event.detail ? `: ${event.detail}` : ""}`
          : event.type === "tool_start" || event.type === "tool_result" || event.type === "error" || event.type === "command"
            ? event.text
            : active.lastEventText;
        const progress = active.renderer.accept(event);
        await this.maybeSendApproval(message, active, runtime.state, sentGates);
        const now = Date.now();
        if (progress && (lastProgressAt === 0 || now - lastProgressAt > 8000)) {
          await this.sendText(message, progress);
          lastProgressAt = now;
        } else if (now - lastProgressAt > 30_000) {
          const heartbeat = active.renderer.progress({ important: true });
          if (heartbeat) {
            await this.sendText(message, heartbeat);
            lastProgressAt = now;
          }
        }
      }
      active.runId = active.runId ?? runtime.state.listRuns(1)[0]?.id;
      const final = active.renderer.final({
        stateStore: runtime.state,
        runId: active.runId,
        projectPath: active.projectPath,
      });
      await this.sendText(message, final.text);
      await this.sendArtifactsAndSummary(message, runtime, active.runId, final);
    } catch (error) {
      const messageText = errorMessage(error);
      await this.sendText(
        message,
        /cancelled|stopped/i.test(messageText)
          ? "任务已停止。"
          : `任务异常：${compactOneLine(messageText, 1000)}`,
      );
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

  private async answerSideQuestion(message: RemoteMessage, question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed) {
      await this.sendText(message, "请输入旁路问题，例如：/ask 现在做到哪一步了？");
      return;
    }
    const projectPath = this.currentProject(message.chatId);
    const runtime = this.runtimeFor(projectPath);
    const provider = runtime.config.provider ? new DeepSeekClient(runtime.config.provider) : runtime.provider;
    if (!provider) {
      await this.sendText(message, "DeepSeek provider 未配置，暂时无法回答旁路问题。");
      return;
    }
    const active = this.activeRuns.get(message.chatId);
    const fallbackRun = runtime.state.listRuns(1)[0]?.id;
    const runId = active?.runId ?? fallbackRun;
    await this.sendText(message, "收到，我用只读上下文快速回答，不会打断当前任务。");
    const result = await answerAsyncQuestion({
      question: trimmed,
      config: runtime.config,
      state: runtime.state,
      provider,
      runId,
    });
    if (result.usage && runId) {
      runtime.state.recordUsage(runId, result.usage, "remote_async_ask");
    }
    runtime.state.appendEvent(runId ?? null, "remote_async_question_answered", {
      channel: "wechat-openclaw",
      chat_id: message.chatId,
      question_preview: compactOneLine(trimmed, 160),
    });
    await this.sendText(message, `旁路回答\n${compactOneLine(result.answer, 1600)}`);
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
        // Keep processing text even when one attachment fails to download.
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
    const active = this.activeRuns.get(chatId);
    return buildRemoteStatus({
      connection: this.status(),
      projectPath,
      model: runtime.config.model,
      shellAllowed: this.permissionsFor(chatId, projectPath).allowShell,
      state: runtime.state,
      active: active
        ? {
            runId: active.runId,
            startedAtMs: active.startedAtMs,
            lastEventAtMs: active.lastEventAtMs,
            lastEventText: active.lastEventText,
            renderer: active.renderer.snapshot(),
          }
        : undefined,
    });
  }

  private artifactsReply(chatId: string): string {
    const runtime = this.runtimeFor(this.currentProject(chatId));
    const run = runtime.state.listRuns(1)[0];
    if (!run) return "暂无任务产物。";
    const artifacts = artifactPaths(runtime, run.id).map((artifact) => `- ${artifact.path}${artifact.kind ? ` (${artifact.kind})` : ""}`);
    if (!artifacts.length) return "最近任务没有记录到产物。";
    return [
      "📦 最近产物",
      `共 ${artifacts.length} 个。这里只列文件名，避免刷屏。`,
      ...artifacts.slice(-8).map((line) => `- ${briefFile(line)}`),
    ].join("\n");
  }

  private usageReply(chatId: string): string {
    const runtime = this.runtimeFor(this.currentProject(chatId));
    const run = runtime.state.listRuns(1)[0];
    const usage = run ? runtime.state.usageTotals(run.id) : runtime.state.usageTotals();
    return [
      "💰 使用量",
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
    this.pendingApprovals.delete(message.chatId);
    await this.sendText(message, "已请求停止当前任务。");
  }

  private async handleShellCommand(message: RemoteMessage, arg: string): Promise<void> {
    const projectPath = this.currentProject(message.chatId);
    const normalized = arg.trim().toLowerCase();
    if (["on", "enable", "enabled", "开", "开启"].includes(normalized)) {
      this.sessionShellGrants.add(sessionGrantKey(message.chatId, projectPath));
      const active = this.activeRuns.get(message.chatId);
      if (active && path.resolve(active.projectPath) === path.resolve(projectPath)) {
        active.permissions.allowShell = true;
        active.permissions.profile = "custom";
      }
      await this.sendText(message, `shell 已为当前微信会话开启。\n项目：${projectPath}\n具体命令仍会经过工具权限和安全策略。`);
      return;
    }
    if (["off", "disable", "disabled", "关", "关闭"].includes(normalized)) {
      this.sessionShellGrants.delete(sessionGrantKey(message.chatId, projectPath));
      const active = this.activeRuns.get(message.chatId);
      if (active && !this.options.permissions.allowShell) {
        active.permissions.allowShell = false;
        active.permissions.profile = this.options.permissions.profile;
      }
      await this.sendText(message, `shell 已为当前微信会话关闭。\n项目：${projectPath}`);
      return;
    }
    await this.sendText(message, `当前 shell：${this.permissionsFor(message.chatId, projectPath).allowShell ? "on" : "off"}\n发送 /shell on 开启，/shell off 关闭。`);
  }

  private async sendArtifactsAndSummary(
    message: RemoteMessage,
    runtime: RuntimeBundle,
    runId: string | undefined,
    final: RemoteFinalRender,
  ): Promise<void> {
    const existing = runId ? existingArtifacts(runtime, runId) : [];
    const delivery = planRemoteDelivery(existing.map((artifact) => ({
      path: artifact.path,
      fullPath: artifact.fullPath,
      kind: artifact.kind,
      sizeBytes: artifact.stat.size,
    })));
    if (existing.length) {
      await this.sendText(message, deliverySummary(existing, delivery.candidates));
    }

    let sentVisual = false;
    const visual = await this.bestVisualArtifact(runtime, delivery.candidates);
    if (visual) {
      sentVisual = await this.trySendMedia(message, visual, "任务效果快照");
    }

    let sentFiles = 0;
    for (const artifact of delivery.files.slice(0, 3)) {
      if (artifact.fullPath === visual) continue;
      if (await this.trySendMedia(message, artifact.fullPath, `产物文件：${path.basename(artifact.fullPath)}`)) {
        sentFiles += 1;
      }
    }

    if (!sentVisual && sentFiles === 0) {
      const summaryPath = this.writeRemoteSummary(runtime, runId, final.markdown);
      await this.sendText(message, [
        "📄 暂时没有微信可直接预览的产物。",
        "我已把完成情况保存到本机项目状态里。",
        `本地摘要：${path.basename(summaryPath)}`,
        "发送 /artifacts 可以查看最近产物文件名。",
      ].join("\n"));
    }
  }

  private async bestVisualArtifact(runtime: RuntimeBundle, artifacts: RemoteDeliveryCandidate[]): Promise<string | undefined> {
    const directImage = artifacts.find((artifact) => artifact.deliveryKind === "image" || isImagePath(artifact.fullPath));
    if (directImage) return directImage.fullPath;

    const html = artifacts.find((artifact) => artifact.deliveryKind === "html" || isHtmlPath(artifact.fullPath));
    if (!html) return undefined;
    try {
      const bytes = await captureBrowserScreenshot(pathToFileURL(html.fullPath).href, false);
      const previewDir = path.join(runtime.config.dataDir, "remote", "previews");
      fs.mkdirSync(previewDir, { recursive: true });
      const target = path.join(previewDir, `${safeFilename(path.basename(html.fullPath, path.extname(html.fullPath)))}-${Date.now()}.png`);
      fs.writeFileSync(target, bytes);
      return target;
    } catch {
      const fallback = await captureHtmlWithHeadlessBrowser({
        htmlPath: html.fullPath,
        outputDir: path.join(runtime.config.dataDir, "remote", "previews"),
      });
      return fallback?.path;
    }
  }

  private writeRemoteSummary(runtime: RuntimeBundle, runId: string | undefined, markdown: string): string {
    const dir = path.join(runtime.config.dataDir, "remote", "summaries");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `remote-task-summary-${safeFilename(runId ?? "latest")}.md`);
    fs.writeFileSync(target, `${markdown.trim()}\n`, "utf-8");
    return target;
  }

  private async trySendMedia(message: RemoteMessage, fullPath: string, caption: string): Promise<boolean> {
    const active = this.activeRuns.get(message.chatId);
    const raw = message.raw as OpenClawMessage | undefined;
    const target = active?.replyTarget || replyTargetFromRaw(raw);
    const contextToken = active?.contextToken || String(raw?.context_token ?? "");
    if (!this.client || !fs.existsSync(fullPath)) return false;
    try {
      await this.client.sendMediaFile(target, fullPath, caption, contextToken);
      return true;
    } catch (error) {
      await this.sendText(message, `产物发送失败：${path.basename(fullPath)}，${compactOneLine(errorMessage(error), 160)}`);
      return false;
    }
  }

  private async sendText(message: RemoteMessage, text: string): Promise<void> {
    const active = this.activeRuns.get(message.chatId);
    const raw = message.raw as OpenClawMessage | undefined;
    const target = active?.replyTarget || replyTargetFromRaw(raw);
    const contextToken = active?.contextToken || String(raw?.context_token ?? "");
    const output = redactRemoteText(text, 4500);
    await this.client?.sendText(target, output, contextToken);
    this.remoteAssistantListener?.(remoteTranscriptText(output));
  }
}

let sharedService: WeChatOpenClawRemoteControlService | undefined;

export function getSharedWeChatOpenClawRemoteControlService(
  options: WeChatOpenClawRemoteControlOptions,
): WeChatOpenClawRemoteControlService {
  if (!sharedService) {
    sharedService = new WeChatOpenClawRemoteControlService(options);
  } else {
    sharedService.setStatusListener(options.onStatus);
    sharedService.setRemoteTranscriptListeners({
      onRemoteUserMessage: options.onRemoteUserMessage,
      onRemoteAssistantMessage: options.onRemoteAssistantMessage,
    });
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
  if (["help", "status", "project", "artifacts", "usage", "shell", "stop", "continue", "ask"].includes(name)) {
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
    "🤖 DeepSeekCode 个人微信远程控制",
    "可用命令：",
    "- /status 查看状态",
    "- /status full 查看更详细状态",
    "- /ask <问题> 在长任务运行中旁路问答",
    "- /project 查看当前项目",
    "- /project D:\\code\\Project 切换项目",
    "- /run <任务> 执行任务",
    "- /continue 继续上次任务",
    "- /artifacts 查看产物",
    "- /usage 查看用量",
    "- /shell on 或 /shell off 切换本会话 shell",
    "- /stop 停止当前任务",
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

function artifactPaths(runtime: RuntimeBundle, runId: string): TraceArtifact[] {
  const trace = runtime.state.traceRun(runId) as { artifacts?: TraceArtifact[] };
  return trace.artifacts ?? [];
}

interface ExistingArtifact {
  path: string;
  fullPath: string;
  kind?: string;
  stat: fs.Stats;
}

function existingArtifacts(runtime: RuntimeBundle, runId: string): ExistingArtifact[] {
  const existing: ExistingArtifact[] = [];
  for (const artifact of artifactPaths(runtime, runId)) {
    if (!artifact.path) continue;
    const fullPath = path.isAbsolute(artifact.path) ? artifact.path : path.join(runtime.config.projectPath, artifact.path);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;
    existing.push({ path: artifact.path, fullPath, kind: artifact.kind, stat });
  }
  return existing;
}

function deliverySummary(existing: ExistingArtifact[], candidates: RemoteDeliveryCandidate[]): string {
  const preview = candidates.find((candidate) => candidate.deliveryKind === "image" || candidate.deliveryKind === "html");
  const files = candidates.filter((candidate) => candidate.canSendFile);
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.deliveryKind, (counts.get(candidate.deliveryKind) ?? 0) + 1);
  }
  const typeSummary = [...counts.entries()]
    .map(([kind, count]) => `${deliveryKindLabel(kind)} ${count}`)
    .join("；");
  return [
    "📦 产物已生成",
    `共 ${existing.length} 个文件。${typeSummary ? `类型：${typeSummary}` : ""}`,
    preview ? `预览：${path.basename(preview.fullPath)}，将优先发送图片快照。` : "",
    files.length ? `微信可直接打开：${files.slice(0, 3).map((file) => path.basename(file.fullPath)).join("；")}` : "微信可直接打开的文件：暂无",
    "不会自动发送 HTML/CSS/JS/MD 等微信不易预览的原始文件。",
  ].filter(Boolean).join("\n");
}

function deliveryKindLabel(kind: string): string {
  switch (kind) {
    case "image":
      return "图片";
    case "html":
      return "网页";
    case "office":
      return "Office";
    case "pdf":
      return "PDF";
    case "text":
      return "文本";
    case "code":
      return "代码";
    case "archive":
      return "压缩包";
    default:
      return "文件";
  }
}

function briefFile(value: string): string {
  const cleaned = value.replace(/^\s*-\s*/, "").replace(/\s+\([^)]+\)$/u, "");
  return path.basename(cleaned) || cleaned;
}

function isImagePath(filePath: string): boolean {
  return /\.(png|jpg|jpeg|webp)$/i.test(filePath);
}

function isHtmlPath(filePath: string): boolean {
  return /\.(html|htm)$/i.test(filePath);
}

function sessionGrantKey(chatId: string, projectPath: string): string {
  return `${chatId}:${path.resolve(projectPath)}`;
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "file";
}

function remoteTranscriptText(value: string): string {
  return compactOneLine(value, 1800);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
