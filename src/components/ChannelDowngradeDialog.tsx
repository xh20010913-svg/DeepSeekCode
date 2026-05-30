import React from "react";
import { Dialog } from "./design/Dialog.js";

export function ChannelDowngradeDialog(props: {
  from: string;
  to: string;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Channel changed" statusLabel="downgraded" statusTone="warning" width={props.width}>
      {`${props.from} -> ${props.to}`}
    </Dialog>
  );
}
