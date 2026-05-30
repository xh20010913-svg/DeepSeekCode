import React from "react";
import { Text } from "ink";

export function UserPlanMessage(props: { text: string }): React.ReactElement {
  return <Text color="cyan">plan: {props.text}</Text>;
}
