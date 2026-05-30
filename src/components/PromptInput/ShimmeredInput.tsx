import React from "react";
import { Text } from "ink";
import { truncatePromptForFooter } from "./utils.js";

export function shimmeredInputText(value: string, working: boolean, width = 80): string {
  const text = truncatePromptForFooter(value, width);
  return working ? `${text}...` : text;
}

export function ShimmeredInput(props: {
  value: string;
  working: boolean;
  width?: number;
}): React.ReactElement {
  return <Text color={props.working ? "cyan" : undefined}>{shimmeredInputText(props.value, props.working, props.width)}</Text>;
}
