import React from "react";
import { Text } from "ink";

export function TeammateSpinnerLine(props: { name: string; active: boolean }): React.ReactElement {
  return <Text color={props.active ? "cyan" : "gray"}>{props.active ? ">" : " "} {props.name}</Text>;
}
