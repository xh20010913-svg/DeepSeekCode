import React from "react";
import { Text } from "ink";

export function ShowInIDEPrompt(props: { path: string }): React.ReactElement {
  return <Text color="gray">open in IDE: {props.path}</Text>;
}
