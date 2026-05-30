import React from "react";
import { Dialog } from "./design/Dialog.js";

export function TeleportRepoMismatchDialog(props: { expected: string; actual: string; width?: number }): React.ReactElement {
  return <Dialog title="Repository mismatch" statusLabel="warning" statusTone="warning" width={props.width}>{`${props.expected} != ${props.actual}`}</Dialog>;
}
