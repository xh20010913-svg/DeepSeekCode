import React from "react";
import { Box, Text } from "ink";
import { BackgroundTaskStatus } from "./BackgroundTaskStatus.js";
import type { TaskStatus } from "./taskStatusUtils.js";

export function backgroundTaskSummary(id: string, status: TaskStatus): string {
  return `${id || "task"} | ${status || "unknown"}`;
}

export function BackgroundTask(props: { id: string; status: TaskStatus; title?: string }): React.ReactElement {
  return (
    <Box>
      <BackgroundTaskStatus status={props.status} />
      <Text> {props.title ?? props.id}</Text>
    </Box>
  );
}
