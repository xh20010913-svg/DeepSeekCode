import React from "react";
import { ThemePanel, themeCurrentPanelModel, themeListPanelModel } from "../../components/ThemePanel.js";
import { setActiveTerminalTheme } from "../../components/design/terminalTheme.js";
import { ThemeService } from "../../services/theme/themeService.js";
import type { Command } from "../../types/command.js";

export const themeCommand: Command = {
  name: "theme",
  description: "View or set the DeepSeekCode terminal theme.",
  usage: "[list|current|set <name>|reset|path]",
  execute(args, context) {
    const service = new ThemeService(context.config.projectPath);
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    const [mode = "current", ...rest] = tokens;

    try {
      if (mode === "list") {
        const current = service.current();
        return {
          message: service.list().map((theme) =>
            `${theme.name}${theme.name === current.theme ? " *" : ""} - ${theme.description}`,
          ).join("\n"),
          display: React.createElement(ThemePanel, {
            model: themeListPanelModel({ themes: service.list(), current }),
          }),
        };
      }

      if (mode === "current" || mode === "status") {
        const current = service.current();
        return {
          message: `theme: ${current.theme} (${current.source})`,
          display: React.createElement(ThemePanel, { model: themeCurrentPanelModel(current, "current") }),
        };
      }

      if (mode === "set") {
        const name = rest.join(" ");
        if (!name) return { message: "Usage: /theme set <name>" };
        const current = service.set(name);
        setActiveTerminalTheme(current.theme);
        return {
          message: `theme set to ${current.theme}`,
          display: React.createElement(ThemePanel, { model: themeCurrentPanelModel(current, "set") }),
        };
      }

      if (mode === "reset" || mode === "auto") {
        const current = service.reset();
        setActiveTerminalTheme(current.theme);
        return {
          message: `theme reset to ${current.theme}`,
          display: React.createElement(ThemePanel, { model: themeCurrentPanelModel(current, "reset") }),
        };
      }

      if (mode === "path") {
        const current = service.current();
        return {
          message: service.path(),
          display: React.createElement(ThemePanel, { model: themeCurrentPanelModel(current, "path") }),
        };
      }

      return { message: "Usage: /theme [list|current|set <name>|reset|path]" };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  },
};
