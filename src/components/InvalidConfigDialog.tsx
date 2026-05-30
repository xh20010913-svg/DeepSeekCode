import React from "react";
import { Dialog } from "./design/Dialog.js";

export function InvalidConfigDialog(props: {
  message: string;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Invalid config" statusLabel="error" statusTone="error" width={props.width}>
      {props.message}
    </Dialog>
  );
}
