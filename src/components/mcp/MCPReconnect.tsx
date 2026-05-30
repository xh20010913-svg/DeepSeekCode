import React from "react";
import { Text } from "ink";
import { reconnectDelayLabel } from "./utils/reconnectHelpers.js";

export function MCPReconnect(props: { attempt: number }): React.ReactElement {
  return <Text color="yellow">reconnect in {reconnectDelayLabel(props.attempt)}</Text>;
}
