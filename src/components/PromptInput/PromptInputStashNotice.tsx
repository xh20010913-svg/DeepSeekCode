import React from "react";
import { Text } from "ink";

export function promptInputStashNoticeText(count: number): string {
  return count > 0 ? `${count} stashed prompt${count === 1 ? "" : "s"}` : "";
}

export function PromptInputStashNotice(props: {
  count: number;
}): React.ReactElement | null {
  const text = promptInputStashNoticeText(props.count);
  return text ? <Text color="gray">{text}</Text> : null;
}
