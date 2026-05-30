import React from "react";
import { StatusBadge } from "./design/StatusBadge.js";

export function IdeStatusIndicator(props: { connected: boolean }): React.ReactElement {
  return <StatusBadge label={props.connected ? "ide" : "no ide"} tone={props.connected ? "success" : "muted"} />;
}
