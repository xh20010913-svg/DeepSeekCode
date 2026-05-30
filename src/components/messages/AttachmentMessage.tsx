import React from "react";
import { Text } from "ink";

export function attachmentLabel(name: string, bytes?: number): string {
  const clean = name.trim() || "attachment";
  return bytes === undefined ? clean : `${clean} (${bytes} bytes)`;
}

export function AttachmentMessage(props: { name: string; bytes?: number }): React.ReactElement {
  return <Text color="gray">{attachmentLabel(props.name, props.bytes)}</Text>;
}
