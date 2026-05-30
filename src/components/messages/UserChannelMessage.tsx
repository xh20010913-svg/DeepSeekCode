import React from "react";
import { StatusBadge } from "../design/StatusBadge.js";

export function UserChannelMessage(props: { channel: string }): React.ReactElement {
  return <StatusBadge label={props.channel || "channel"} tone="brand" />;
}
