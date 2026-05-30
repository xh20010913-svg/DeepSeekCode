import React from "react";
import { StatusBadge } from "../design/StatusBadge.js";

export function WorkerBadge(props: { label?: string }): React.ReactElement {
  return <StatusBadge label={props.label ?? "worker"} tone="brand" />;
}
