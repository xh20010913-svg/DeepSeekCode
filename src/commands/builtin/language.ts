import { UiLanguageService, isChineseUi, normalizeUiLanguage } from "../../services/ui/languageService.js";
import type { Command } from "../../types/command.js";

export const languageCommand: Command = {
  name: "language",
  aliases: ["lang"],
  description: "View or set the TUI language.",
  usage: "[zh|en|current|reset|path]",
  execute(args, context) {
    const service = new UiLanguageService(context.config.projectPath);
    const mode = args.trim() || "current";

    try {
      if (mode === "current" || mode === "status") {
        const current = service.current();
        return { message: languageStatus(current.language, current.source, current.path) };
      }

      if (mode === "reset" || mode === "auto") {
        const current = service.reset();
        context.switchLanguage?.(current.language);
        return { message: languageStatus(current.language, current.source, current.path) };
      }

      if (mode === "path") {
        return { message: service.path() };
      }

      const language = normalizeUiLanguage(mode);
      if (!language) return { message: "Usage: /language [zh|en|current|reset|path]" };
      const current = service.set(language);
      context.switchLanguage?.(current.language);
      return {
        message: isChineseUi(current.language)
          ? `界面语言已设置为中文 (${current.source})`
          : `UI language set to English (${current.source})`,
      };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  },
};

function languageStatus(language: string, source: string, settingsPath: string): string {
  return isChineseUi(language)
    ? `界面语言：中文 (${source})\n配置文件：${settingsPath}\n使用 /language en 切换英文。`
    : `UI language: English (${source})\nConfig file: ${settingsPath}\nUse /language zh to switch Chinese.`;
}
