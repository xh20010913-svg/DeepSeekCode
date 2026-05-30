import React, { createContext, useContext } from "react";
import { getTerminalTheme, type TerminalThemeDefinition } from "../../services/theme/themeCatalog.js";

const ThemeContext = createContext<TerminalThemeDefinition>(getTerminalTheme(process.env.DEEPSEEKCODE_THEME));

export function ThemeProvider(props: {
  themeName?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <ThemeContext.Provider value={getTerminalTheme(props.themeName ?? process.env.DEEPSEEKCODE_THEME)}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useDeepSeekTerminalTheme(): TerminalThemeDefinition {
  return useContext(ThemeContext);
}
