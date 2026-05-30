import React from "react";
import { Dialog } from "./design/Dialog.js";

export function exitFlowMessage(hasRunningTasks: boolean): string {
  return hasRunningTasks
    ? "There are unfinished local runs. Use /runs or /attach before quitting."
    : "DeepSeekCode is idle and ready to quit.";
}

export function ExitFlow(props: {
  hasRunningTasks: boolean;
  width?: number;
}): React.ReactElement {
  return (
    <Dialog title="Exit DeepSeekCode" statusLabel={props.hasRunningTasks ? "busy" : "idle"} statusTone={props.hasRunningTasks ? "warning" : "success"} width={props.width}>
      {exitFlowMessage(props.hasRunningTasks)}
    </Dialog>
  );
}
