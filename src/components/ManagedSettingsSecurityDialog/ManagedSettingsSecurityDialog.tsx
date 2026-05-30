import React from "react";
import { Dialog } from "../design/Dialog.js";
import { managedSettingsSecurityLabel } from "./utils.js";

export function ManagedSettingsSecurityDialog(props: { managed: boolean; width?: number }): React.ReactElement {
  return (
    <Dialog title="Settings security" statusLabel={props.managed ? "managed" : "local"} statusTone={props.managed ? "warning" : "success"} width={props.width}>
      {managedSettingsSecurityLabel(props.managed)}
    </Dialog>
  );
}
