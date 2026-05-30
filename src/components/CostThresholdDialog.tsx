import React from "react";
import { Dialog } from "./design/Dialog.js";

export function costThresholdTone(costUsd: number, thresholdUsd: number): "success" | "warning" | "error" {
  if (!Number.isFinite(costUsd) || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) return "warning";
  if (costUsd >= thresholdUsd) return "error";
  if (costUsd >= thresholdUsd * 0.75) return "warning";
  return "success";
}

export function CostThresholdDialog(props: {
  costUsd: number;
  thresholdUsd: number;
  width?: number;
}): React.ReactElement {
  const tone = costThresholdTone(props.costUsd, props.thresholdUsd);
  return (
    <Dialog title="Cost threshold" statusLabel={tone} statusTone={tone} width={props.width}>
      Estimated cost ${props.costUsd.toFixed(4)} of ${props.thresholdUsd.toFixed(4)}.
    </Dialog>
  );
}
