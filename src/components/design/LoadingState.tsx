import React from "react";
import { Box, Text } from "ink";
import { StatusIcon } from "./StatusIcon.js";

export interface LoadingStateModel {
  message: string;
  subtitle?: string;
}

export function loadingStateLabel(model: LoadingStateModel): string {
  const message = model.message.trim() || "Working";
  const subtitle = model.subtitle?.trim();
  return subtitle ? `${message} - ${subtitle}` : message;
}

export function LoadingState(props: LoadingStateModel & {
  bold?: boolean;
  dim?: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <StatusIcon state="loading" withSpace />
        <Text bold={props.bold} dimColor={props.dim}>{props.message}</Text>
      </Box>
      {props.subtitle && <Text color="gray">{props.subtitle}</Text>}
    </Box>
  );
}
