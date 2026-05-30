import React from "react";
import { Dialog } from "./design/Dialog.js";

export function BridgeDialog(props: {
  connected: boolean;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Bridge" statusLabel={props.connected ? "connected" : "offline"} statusTone={props.connected ? "success" : "warning"} width={props.width}>
      Browser and IDE bridge status for local DeepSeekCode integrations.
    </Dialog>
  );
}
