import React from "react";
import { Text } from "ink";
import { ConfigurableShortcutHint } from "./ConfigurableShortcutHint.js";

export function CtrlOToExpand(): React.ReactElement {
  return (
    <Text color="gray">
      <ConfigurableShortcutHint
        action="app:quickOpen"
        context="Global"
        fallback="Ctrl+O"
        description="quick open"
        parens
      />
    </Text>
  );
}

export function ctrlOToExpand(): string {
  return "(Ctrl+O to quick open)";
}
