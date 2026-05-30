import React from "react";
import { Dialog } from "./design/Dialog.js";

export function BypassPermissionsModeDialog(props: {
  enabled: boolean;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Permissions mode" statusLabel={props.enabled ? "open" : "safe"} statusTone={props.enabled ? "error" : "success"} width={props.width}>
      {props.enabled ? "Open permissions are enabled. Review tool actions carefully." : "Safe permissions are active."}
    </Dialog>
  );
}
