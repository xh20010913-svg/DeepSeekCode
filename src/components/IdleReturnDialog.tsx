import React from "react";
import { Dialog } from "./design/Dialog.js";

export function IdleReturnDialog(props: { width?: number }): React.ReactElement {
  return <Dialog title="Idle" statusLabel="ready" statusTone="success" width={props.width}>DeepSeekCode is ready.</Dialog>;
}
