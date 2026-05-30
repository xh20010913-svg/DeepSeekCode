import React from "react";
import { Text } from "ink";

export function UserTeammateMessage(props: { name: string; text: string }): React.ReactElement {
  return <Text color="cyan">{props.name || "agent"}: {props.text}</Text>;
}
