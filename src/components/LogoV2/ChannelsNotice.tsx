import React from "react";
import { Text } from "ink";

export function ChannelsNotice(props: { text?: string }): React.ReactElement {
  return <Text color="gray">{props.text ?? "DeepSeekCode channel ready"}</Text>;
}
