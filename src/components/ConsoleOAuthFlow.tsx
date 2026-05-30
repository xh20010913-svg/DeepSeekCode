import React from "react";
import { Text } from "ink";

export function ConsoleOAuthFlow(props: { provider: string }): React.ReactElement {
  return <Text color="gray">Configure {props.provider} credentials in environment or .env.</Text>;
}
