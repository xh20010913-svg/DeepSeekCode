import {
  DEFAULT_TERMINAL_THEME,
  getTerminalTheme,
  normalizeTerminalThemeName,
  type TerminalThemeDefinition,
  type TerminalThemeName,
  type TerminalTone,
} from "../../services/theme/themeCatalog.js";

export type { TerminalTone };

let activeTerminalTheme: TerminalThemeName = normalizeTerminalThemeName(process.env.DEEPSEEKCODE_THEME)
  ?? DEFAULT_TERMINAL_THEME;

export function setActiveTerminalTheme(name: unknown): TerminalThemeDefinition {
  activeTerminalTheme = normalizeTerminalThemeName(name) ?? DEFAULT_TERMINAL_THEME;
  return getTerminalTheme(activeTerminalTheme);
}

export function getActiveTerminalTheme(): TerminalThemeDefinition {
  const envTheme = normalizeTerminalThemeName(process.env.DEEPSEEKCODE_THEME);
  return getTerminalTheme(envTheme ?? activeTerminalTheme);
}

export function toneColor(tone: TerminalTone | undefined): string | undefined {
  const selected = getActiveTerminalTheme();
  return selected.colors[tone ?? "default"];
}

export function statusTone(value: boolean, warning = false): TerminalTone {
  if (warning) return "warning";
  return value ? "success" : "error";
}
