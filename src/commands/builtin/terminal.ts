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
      message: [
        "已发送终端恢复序列：关闭鼠标追踪和 bracketed paste，显示光标，重置样式。",
        "如果 Windows 终端仍然异常，可以关闭当前标签页后重新打开；项目进程请使用 /project stop，不要用关闭 TUI 代替停止服务。",
      ].join("\n"),
    };
  },
};
