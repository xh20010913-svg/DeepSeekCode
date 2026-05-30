import React from "react";
import { Dialog } from "./design/Dialog.js";

export function IdeAutoConnectDialog(props: { connected: boolean; width?: number }): React.ReactElement {
  return (
    <Dialog title="IDE bridge" statusLabel={props.connected ? "connected" : "offline"} statusTone={props.connected ? "success" : "muted"} width={props.width}>
      Use file paths and /diff while IDE bridge support is expanded.
    </Dialog>
  );
}
