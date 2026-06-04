import type { Command } from "../../types/command.js";
import { formatWeComConfigStatus, hasWeComRemoteConfig } from "../../remote/wecom/config.js";
import {
  getSharedWeComRemoteControlService,
  stopSharedWeComRemoteControlService,
} from "../../remote/wecom/service.js";

export const remoteControlCommand: Command = {
  name: "remote-control",
  aliases: ["remote", "wecom"],
  description: "Start, stop, or inspect WeCom remote control.",
  usage: "[status|start|stop]",
  async execute(args, context) {
    const action = args.trim().toLowerCase() || "status";
    if (action === "stop" || action === "disconnect") {
      await stopSharedWeComRemoteControlService();
      return { message: "WeCom remote control stopped." };
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
        "Commands:",
        "/remote-control start",
        "/remote-control stop",
        "",
        hasWeComRemoteConfig()
          ? "Configured. Run /remote-control start to connect."
          : "Missing bot id/secret environment variables.",
      ].join("\n"),
    };
  },
};
