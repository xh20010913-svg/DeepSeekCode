import React from "react";
import { Text } from "ink";

export function resourceUpdateText(resource: string, status: string): string {
  return `${resource.trim() || "resource"} ${status.trim() || "updated"}`;
}

export function UserResourceUpdateMessage(props: { resource: string; status: string }): React.ReactElement {
  return <Text color="gray">{resourceUpdateText(props.resource, props.status)}</Text>;
}
