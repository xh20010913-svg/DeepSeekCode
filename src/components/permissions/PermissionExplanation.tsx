import React from "react";
import { Text } from "ink";

export function permissionExplanationText(scope: string): string {
  if (scope === "shell") return "Shell commands can change your local workspace.";
  if (scope === "browser") return "Browser actions can interact with open pages.";
  return "Review the action before allowing it.";
}

export function PermissionExplanation(props: { scope: string }): React.ReactElement {
  return <Text color="gray">{permissionExplanationText(props.scope)}</Text>;
}
