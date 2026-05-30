import React from "react";
import { Text } from "ink";

export function permissionDecisionDebugText(decision: string, reason?: string): string {
  return [decision || "unknown", reason].filter(Boolean).join(": ");
}

export function PermissionDecisionDebugInfo(props: { decision: string; reason?: string }): React.ReactElement {
  return <Text color="gray">{permissionDecisionDebugText(props.decision, props.reason)}</Text>;
}
