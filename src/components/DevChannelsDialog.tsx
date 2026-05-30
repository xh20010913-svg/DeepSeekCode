import React from "react";
import { Dialog } from "./design/Dialog.js";

export function DevChannelsDialog(props: { channel: string; width?: number }): React.ReactElement {
  return (
    <Dialog title="Channel" statusLabel={props.channel || "local"} statusTone="brand" width={props.width}>
      DeepSeekCode local development channel.
    </Dialog>
  );
}
