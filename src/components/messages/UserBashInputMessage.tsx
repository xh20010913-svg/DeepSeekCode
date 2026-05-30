import React from "react";
import { Text } from "ink";

export function UserBashInputMessage(props: { command: string }): React.ReactElement {
  return <Text color="cyan">$ {props.command}</Text>;
}
