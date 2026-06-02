export type TerminalTone = "default" | "brand" | "muted" | "success" | "warning" | "error";
export type TerminalThemeName = "deepseek-dark" | "warm-classic" | "high-contrast" | "cache-green";

export interface TerminalThemeDefinition {
  name: TerminalThemeName;
  label: string;
  description: string;
  colors: Record<TerminalTone, string | undefined>;
}

export const DEFAULT_TERMINAL_THEME: TerminalThemeName = "deepseek-dark";

export const terminalThemes: TerminalThemeDefinition[] = [
  {
    name: "deepseek-dark",
    label: "DeepSeek Dark",
    description: "Cyan brand accents with familiar green/yellow/red status colors for dark terminals.",
    colors: {
      default: undefined,
      brand: "cyan",
      muted: "gray",
      success: "green",
      warning: "yellow",
      error: "red",
    },
  },
  {
    name: "warm-classic",
    label: "Warm Classic",
    description: "Warmer magenta brand accent for users who prefer a softer terminal palette.",
    colors: {
      default: undefined,
      brand: "magenta",
      muted: "gray",
      success: "green",
      warning: "yellow",
      error: "red",
    },
  },
  {
    name: "high-contrast",
    label: "High Contrast",
    description: "White primary accents and saturated status colors for difficult terminal themes.",
    colors: {
      default: undefined,
      brand: "white",
      muted: "gray",
      success: "green",
      warning: "yellow",
      error: "red",
    },
  },
  {
    name: "cache-green",
    label: "Cache Green",
    description: "Green brand accent for cache-first DeepSeek workflows and token-saving sessions.",
    colors: {
      default: undefined,
      brand: "green",
      muted: "gray",
      success: "green",
      warning: "yellow",
      error: "red",
    },
  },
];

export function normalizeTerminalThemeName(value: unknown): TerminalThemeName | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return terminalThemes.some((theme) => theme.name === normalized)
    ? normalized as TerminalThemeName
    : null;
}

export function getTerminalTheme(name: unknown): TerminalThemeDefinition {
  const normalized = normalizeTerminalThemeName(name) ?? DEFAULT_TERMINAL_THEME;
  return terminalThemes.find((theme) => theme.name === normalized) ?? terminalThemes[0]!;
}
