import React from "react";
import { Box } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";
import type { TerminalTone } from "./design/terminalTheme.js";
import { MessageModel } from "./MessageModel.js";
import { MessageTimestamp, type MessageTimestampValue } from "./MessageTimestamp.js";

export interface MessageRowMeta {
  label: string;
  tone: TerminalTone;
  dimBody?: boolean;
}

export interface MessageRowMetadata {
  timestamp?: MessageTimestampValue;
  model?: string;
  streaming?: boolean;
}

export interface MessageRowModel {
  marginBottom: number;
  bodyPaddingLeft: number;
  showMetadata: boolean;
}

export function MessageRow(props: {
  meta: MessageRowMeta;
  metadata?: MessageRowMetadata;
  isToolLike?: boolean;
  width?: number;
  children: React.ReactNode;
}): React.ReactElement {
  const model = messageRowModel({
    isToolLike: Boolean(props.isToolLike),
    hasMetadata: Boolean(props.metadata),
  });
  return (
    <Box flexDirection="column" marginBottom={model.marginBottom}>
      {model.showMetadata && props.metadata ? (
        <Box
          flexDirection="row"
          justifyContent="flex-end"
          gap={1}
          width={props.width}
        >
          <MessageTimestamp timestamp={props.metadata.timestamp} />
          <MessageModel model={props.metadata.model} streaming={props.metadata.streaming} />
        </Box>
      ) : null}
      <Box flexDirection="row">
        <StatusBadge label={props.meta.label} tone={props.meta.tone} />
      </Box>
      <Box paddingLeft={model.bodyPaddingLeft}>
        {props.children}
      </Box>
    </Box>
  );
}

export function messageRowModel(input: {
  isToolLike: boolean;
  hasMetadata: boolean;
}): MessageRowModel {
  return {
    marginBottom: input.isToolLike ? 0 : 1,
    bodyPaddingLeft: 2,
    showMetadata: input.hasMetadata,
  };
}
