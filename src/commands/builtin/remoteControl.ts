import type { Command } from "../../types/command.js";
import { formatWeComConfigStatus, hasWeComRemoteConfig } from "../../remote/wecom/config.js";
import { formatWeChatOpenClawStatus } from "../../remote/wechat/config.js";
import {
  getSharedWeComRemoteControlService,
  stopSharedWeComRemoteControlService,
} from "../../remote/wecom/service.js";
import {
  getSharedWeChatOpenClawRemoteControlService,
  stopSharedWeChatOpenClawRemoteControlService,
} from "../../remote/wechat/service.js";

export const remoteControlCommand: Command = {
  name: "remote-control",
  aliases: ["remote", "wecom"],
  description: "Start, stop, or inspect remote control channels.",
  usage: "[status|start|stop|wecom start|wechat login|wechat start|wechat stop]",
  async execute(args, context) {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const channel = parts[0]?.toLowerCase();
    const action = (channel === "wecom" || channel === "wechat")
      ? (parts[1]?.toLowerCase() || "status")
      : (parts[0]?.toLowerCase() || "status");
    if (channel === "wechat") {
      const service = getSharedWeChatOpenClawRemoteControlService({
        baseConfig: context.config,
        baseState: context.state,
        baseProvider: context.provider,
        permissions: context.permissions,
        onStatus: context.emitSystemMessage,
        onRemoteUserMessage: context.emitRemoteUserMessage,
        onRemoteAssistantMessage: context.emitRemoteAssistantMessage,
      });
      if (action === "login") {
        await service.login();
        return { message: "WeChat OpenClaw login stored." };
      }
      if (action === "start" || action === "connect") {
        await service.start();
        return {
          message: [
            "WeChat OpenClaw remote control started.",
            `status=${service.status()}`,
            `project=${context.config.projectPath}`,
          ].join("\n"),
        };
      }
      if (action === "stop" || action === "disconnect") {
        await stopSharedWeChatOpenClawRemoteControlService();
        return { message: "WeChat OpenClaw remote control stopped." };
      }
      return {
        message: [
          formatWeChatOpenClawStatus(context.config),
          "",
          "Commands:",
          "/remote-control wechat login",
          "/remote-control wechat start",
          "/remote-control wechat stop",
        ].join("\n"),
      };
    }
    if (channel === "wecom") {
      return await runWeComAction(action, context);
    }
    if (action === "stop" || action === "disconnect") {
      await stopSharedWeComRemoteControlService();
      await stopSharedWeChatOpenClawRemoteControlService();
      return { message: "Remote control stopped." };
    }
    if (action === "start" || action === "connect" || action === "wecom") {
      if (!hasWeComRemoteConfig()) {
        return {
          message: [
            "WeCom remote control is not configured.",
            "Set DEEPSEEKCODE_WECOM_BOT_ID and DEEPSEEKCODE_WECOM_BOT_SECRET, then run /remote-control start.",
          ].join("\n"),
        };
      }
      const service = getSharedWeComRemoteControlService({
        baseConfig: context.config,
        baseState: context.state,
        baseProvider: context.provider,
        permissions: context.permissions,
        onStatus: context.emitSystemMessage,
      });
      await service.start();
      return {
        message: [
          "WeCom remote control started.",
          `status=${service.status()}`,
          `project=${context.config.projectPath}`,
        ].join("\n"),
      };
    }
    const configured = formatWeComConfigStatus(context.config);
    return {
      message: [
        configured,
        "",
        formatWeChatOpenClawStatus(context.config),
        "",
        "Commands:",
        "/remote-control start",
        "/remote-control stop",
        "/remote-control wecom start",
        "/remote-control wechat login",
        "/remote-control wechat start",
        "/remote-control wechat stop",
        "",
        hasWeComRemoteConfig()
          ? "Configured. Run /remote-control start to connect."
          : "Missing bot id/secret environment variables.",
      ].join("\n"),
    };
  },
};

async function runWeComAction(action: string, context: Parameters<Command["execute"]>[1]) {
  if (action === "stop" || action === "disconnect") {
    await stopSharedWeComRemoteControlService();
    return { message: "WeCom remote control stopped." };
  }
  if (action === "start" || action === "connect" || action === "wecom") {
    if (!hasWeComRemoteConfig()) {
      return {
        message: [
          "WeCom remote control is not configured.",
          "Set DEEPSEEKCODE_WECOM_BOT_ID and DEEPSEEKCODE_WECOM_BOT_SECRET, then run /remote-control wecom start.",
        ].join("\n"),
      };
    }
    const service = getSharedWeComRemoteControlService({
      baseConfig: context.config,
      baseState: context.state,
      baseProvider: context.provider,
      permissions: context.permissions,
      onStatus: context.emitSystemMessage,
    });
    await service.start();
    return {
      message: [
        "WeCom remote control started.",
        `status=${service.status()}`,
        `project=${context.config.projectPath}`,
      ].join("\n"),
    };
  }
  return {
    message: [
      formatWeComConfigStatus(context.config),
      "",
      "Commands:",
      "/remote-control wecom start",
      "/remote-control wecom stop",
    ].join("\n"),
  };
}
