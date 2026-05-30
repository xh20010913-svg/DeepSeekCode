import React from "react";
import { Dialog } from "../design/Dialog.js";

export function FallbackPermissionRequest(props: { action: string; width?: number }): React.ReactElement {
  return (
    <Dialog
      width={props.width ?? 80}
      title="Permission required"
      subtitle={props.action}
      statusLabel="pending"
      statusTone="warning"
    >
      Review the action before allowing it.
    </Dialog>
  );
}
