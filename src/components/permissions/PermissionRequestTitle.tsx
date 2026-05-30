import React from "react";
import { Text } from "ink";

export function permissionRequestTitle(action: string): string {
  return `${action.trim() || "Action"} permission`;
}

export function PermissionRequestTitle(props: { action: string }): React.ReactElement {
  return <Text color="cyan" bold>{permissionRequestTitle(props.action)}</Text>;
}
