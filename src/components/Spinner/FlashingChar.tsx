import React from "react";
import { Text } from "ink";

export function flashingCharFrame(active: boolean): string {
  return active ? "*" : " ";
}

export function FlashingChar(props: { active: boolean }): React.ReactElement {
  return <Text color="cyan">{flashingCharFrame(props.active)}</Text>;
}
