import React from "react";
import { Text } from "ink";

export function glimmerMessageText(text: string, active: boolean): string {
  return active ? `${text}...` : text;
}

export function GlimmerMessage(props: { text: string; active: boolean }): React.ReactElement {
  return <Text color={props.active ? "cyan" : "gray"}>{glimmerMessageText(props.text, props.active)}</Text>;
}
