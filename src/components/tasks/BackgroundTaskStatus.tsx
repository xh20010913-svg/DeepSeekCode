import React from "react";
import { StatusBadge } from "../design/StatusBadge.js";
import { taskStatusTone, type TaskStatus } from "./taskStatusUtils.js";

export function BackgroundTaskStatus(props: { status: TaskStatus }): React.ReactElement {
  return <StatusBadge label={props.status} tone={taskStatusTone(props.status)} />;
}
