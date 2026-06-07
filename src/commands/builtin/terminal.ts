import type { Command } from "../../types/command.js";
import { resetTerminalModes } from "../../components/terminalScreen.js";

export const terminalCommand: Command = {
  name: "terminal",
  description: "Reset terminal modes after TUI or Windows console display issues.",
  usage: "reset",
  execute(args) {
    const trimmed = args.trim();
    if (trimmed !== "reset") return { message: "Usage: /terminal reset" };
    resetTerminalModes();
    return {
      message: "已发送终端恢复序列：关闭鼠标追踪和 bracketed paste，显示光标，重置样式。",
    };
  },
};
