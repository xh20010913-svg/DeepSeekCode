import React from "react";
import { Text } from "ink";

export function UserToolCanceledMessage(props: { reason?: string }): React.ReactElement {
  return <Text color="yellow">tool canceled{props.reason ? `: ${props.reason}` : ""}</Text>;
}
