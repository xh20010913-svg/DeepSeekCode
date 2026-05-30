import React from "react";
import { Text } from "ink";

export function UserCrossSessionMessage(props: { sessionId: string }): React.ReactElement {
  return <Text color="gray">session {props.sessionId}</Text>;
}
