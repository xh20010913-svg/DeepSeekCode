import React from "react";
import { Text } from "ink";
import { promptInputLabel } from "./utils.js";

export function PromptInputFooterLeftSide(props: {
  mode?: string;
}): React.ReactElement {
  return <Text color="gray">{promptInputLabel(props.mode)}</Text>;
}
