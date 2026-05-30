import React from "react";
import { Text } from "ink";

export function UserBashOutputMessage(props: { output: string }): React.ReactElement {
  return <Text>{props.output || " "}</Text>;
}
