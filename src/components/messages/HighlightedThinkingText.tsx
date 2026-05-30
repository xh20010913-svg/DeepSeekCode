import React from "react";
import { Text } from "ink";
import { formatThinkingPreview } from "../ThinkingMessage.js";

export function HighlightedThinkingText(props: { text: string }): React.ReactElement {
  return <Text color="gray">{formatThinkingPreview(props.text)}</Text>;
}
