import React from "react";
import { Dialog } from "./design/Dialog.js";

export function InvalidSettingsDialog(props: {
  message: string;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Invalid settings" statusLabel="error" statusTone="error" width={props.width}>
      {props.message}
    </Dialog>
  );
}
