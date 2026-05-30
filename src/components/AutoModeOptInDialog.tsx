import React from "react";
import { Dialog } from "./design/Dialog.js";

export function AutoModeOptInDialog(props: { enabled: boolean; width?: number }): React.ReactElement {
  return (
    <Dialog title="Auto mode" statusLabel={props.enabled ? "enabled" : "disabled"} statusTone={props.enabled ? "warning" : "muted"} width={props.width}>
      DeepSeekCode keeps destructive tools behind local permissions.
    </Dialog>
  );
}
