import React from "react";
import { Text } from "ink";

export function workerPendingPermissionText(worker: string): string {
  return `${worker.trim() || "worker"} is waiting for permission`;
}

export function WorkerPendingPermission(props: { worker: string }): React.ReactElement {
  return <Text color="yellow">{workerPendingPermissionText(props.worker)}</Text>;
}
