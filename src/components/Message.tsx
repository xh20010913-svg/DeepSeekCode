import React from "react";
import { TranscriptMessage, transcriptRoleMeta, type TranscriptMessageItem } from "./TranscriptMessage.js";

export type MessageItem = TranscriptMessageItem;

export function messageLabel(item: MessageItem): string {
  return transcriptRoleMeta(item.role).label;
}

export function Message(props: {
  item: MessageItem;
  width?: number;
}): React.ReactElement {
  return <TranscriptMessage item={props.item} width={props.width} />;
}
