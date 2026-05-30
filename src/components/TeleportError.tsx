import React from "react";
import { Text } from "ink";

export function TeleportError(props: { message: string }): React.ReactElement {
  return <Text color="red">{props.message}</Text>;
}
