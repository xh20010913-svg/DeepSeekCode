import React from "react";
import { Text } from "ink";

export function MonitorPermissionRequest(props: { target: string }): React.ReactElement {
  return <Text color="yellow">monitor permission: {props.target}</Text>;
}
