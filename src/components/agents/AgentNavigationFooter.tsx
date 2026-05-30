import React from "react";
import { Box, Text } from "ink";
import { toneColor } from "../design/terminalTheme.js";
import type { AgentMenuItem } from "./types.js";

export type AgentNavigationContext = "list" | "detail" | "editor" | "wizard";

export function agentNavigationItems(context: AgentNavigationContext): AgentMenuItem[] {
  const common: AgentMenuItem[] = [
    { id: "help", label: "Help", command: "/help agents", detail: "agent commands", tone: "muted" },
    { id: "doctor", label: "Doctor", command: "/agents doctor", detail: "validate manifests", tone: "brand" },
  ];
  if (context === "list") {
    return [
      { id: "open", label: "Open", command: "enter", detail: "view selected agent", tone: "success" },
      { id: "new", label: "New", command: "/agents new", detail: "create agent", tone: "brand" },
      ...common,
    ];
  }
  if (context === "detail") {
    return [
      { id: "run", label: "Run", command: "/agent run", detail: "start selected agent", tone: "success" },
      { id: "edit", label: "Edit", command: "/agents edit", detail: "modify manifest", tone: "warning" },
      { id: "back", label: "Back", command: "esc", detail: "return to list", tone: "muted" },
      ...common,
    ];
  }
  if (context === "editor") {
    return [
      { id: "save", label: "Save", command: "ctrl+s", detail: "write markdown", tone: "success" },
      { id: "cancel", label: "Cancel", command: "esc", detail: "discard draft", tone: "muted" },
      ...common,
    ];
  }
  return [
    { id: "next", label: "Next", command: "enter", detail: "continue setup", tone: "success" },
    { id: "back", label: "Back", command: "esc", detail: "previous step", tone: "muted" },
    ...common,
  ];
}

export function AgentNavigationFooter(props: {
  context: AgentNavigationContext;
}): React.ReactElement {
  const items = agentNavigationItems(props.context);
  return (
    <Box>
      {items.map((item, index) => (
        <Text key={item.id} color={toneColor(item.tone)}>
          {index > 0 ? "  " : ""}
          {item.command} {item.label}
        </Text>
      ))}
    </Box>
  );
}
