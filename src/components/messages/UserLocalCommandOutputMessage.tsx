import React from "react";
import { Text } from "ink";

export function UserLocalCommandOutputMessage(props: { output: string }): React.ReactElement {
  return <Text>{props.output || " "}</Text>;
}
