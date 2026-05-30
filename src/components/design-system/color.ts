import { getTerminalTheme, terminalThemes, type TerminalTone } from "../../services/theme/themeCatalog.js";
import { toneColor } from "../design/terminalTheme.js";

export { terminalThemes, toneColor };
export type { TerminalTone };

export function themeColor(tone: TerminalTone, themeName?: string): string | undefined {
  return getTerminalTheme(themeName).colors[tone];
}

export function colorSwatch(themeName?: string): Array<{ tone: TerminalTone; color: string | undefined }> {
  const theme = getTerminalTheme(themeName);
  return (Object.keys(theme.colors) as TerminalTone[]).map((tone) => ({
    tone,
    color: theme.colors[tone],
  }));
}
