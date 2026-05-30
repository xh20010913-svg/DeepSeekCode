import React from "react";
import { StatusBadge } from "./design/StatusBadge.js";

export function AwsAuthStatusBox(props: {
  ready: boolean;
}): React.ReactElement {
  return <StatusBadge label={props.ready ? "aws ready" : "aws missing"} tone={props.ready ? "success" : "warning"} />;
}
