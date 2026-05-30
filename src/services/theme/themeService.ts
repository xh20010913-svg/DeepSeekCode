import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_TERMINAL_THEME,
  getTerminalTheme,
  normalizeTerminalThemeName,
  terminalThemes,
  type TerminalThemeDefinition,
  type TerminalThemeName,
} from "./themeCatalog.js";

export interface ThemeSettings {
  theme: TerminalThemeName;
  source: "env" | "project" | "default";
  path: string;
  definition: TerminalThemeDefinition;
}

interface ThemeSettingsDocument {
  theme?: string;
}

export class ThemeService {
  constructor(private readonly projectPath: string) {}

  list(): TerminalThemeDefinition[] {
    return terminalThemes;
  }

  current(): ThemeSettings {
    const envTheme = normalizeTerminalThemeName(process.env.DEEPSEEKCODE_THEME);
    if (envTheme) {
      return this.settings(envTheme, "env");
    }
    const projectTheme = this.readProjectTheme();
    if (projectTheme) {
      return this.settings(projectTheme, "project");
    }
    return this.settings(DEFAULT_TERMINAL_THEME, "default");
  }

  set(name: string): ThemeSettings {
    const theme = normalizeTerminalThemeName(name);
    if (!theme) throw new Error(`Unknown theme: ${name}`);
    fs.mkdirSync(path.dirname(this.path()), { recursive: true });
    fs.writeFileSync(this.path(), `${JSON.stringify({ theme }, null, 2)}\n`, "utf8");
    process.env.DEEPSEEKCODE_THEME = theme;
    return this.settings(theme, "project");
  }

  reset(): ThemeSettings {
    if (fs.existsSync(this.path())) fs.rmSync(this.path(), { force: true });
    delete process.env.DEEPSEEKCODE_THEME;
    return this.settings(DEFAULT_TERMINAL_THEME, "default");
  }

  path(): string {
    return path.join(this.projectPath, ".deepseekcode", "theme.json");
  }

  private settings(theme: TerminalThemeName, source: ThemeSettings["source"]): ThemeSettings {
    return {
      theme,
      source,
      path: this.path(),
      definition: getTerminalTheme(theme),
    };
  }

  private readProjectTheme(): TerminalThemeName | null {
    if (!fs.existsSync(this.path())) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.path(), "utf8")) as ThemeSettingsDocument;
      return normalizeTerminalThemeName(parsed.theme);
    } catch {
      return null;
    }
  }
}
