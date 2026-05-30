import React from "react";
import { Dialog } from "./design/Dialog.js";

export function ClaudeMdExternalIncludesDialog(props: { count: number; width?: number }): React.ReactElement {
  return (
    <Dialog title="External includes" statusLabel={`${props.count} found`} statusTone={props.count > 0 ? "warning" : "success"} width={props.width}>
      Review external project guidance before adding it to stable prompt cache.
    </Dialog>
  );
}
