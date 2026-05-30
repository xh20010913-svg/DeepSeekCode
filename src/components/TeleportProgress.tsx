import React from "react";
import { ProgressBar } from "./design/ProgressBar.js";

export function TeleportProgress(props: { ratio: number; width?: number }): React.ReactElement {
  return <ProgressBar ratio={props.ratio} width={props.width ?? 20} filledTone="brand" showPercent />;
}
