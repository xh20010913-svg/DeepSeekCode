import React from "react";
import { KeyboardShortcutHint } from "./design/KeyboardShortcutHint.js";

export function ConfigurableShortcutHint(props: {
  action: string;
  context?: string;
  fallback: string;
  description: string;
  parens?: boolean;
  bold?: boolean;
}): React.ReactElement {
  return (
    <KeyboardShortcutHint
      shortcut={shortcutDisplay(props.fallback)}
      action={props.description}
      parens={props.parens}
      bold={props.bold}
    />
  );
}

export function shortcutDisplay(fallback: string): string {
  return fallback
    .split("+")
    .map((part) => {
      const normalized = part.trim();
      if (normalized.length <= 1) return normalized.toUpperCase();
      return normalized[0]?.toUpperCase() + normalized.slice(1).toLowerCase();
    })
    .join("+");
}
