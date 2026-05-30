import React from "react";
import { Box, Text } from "ink";
import type { TranscriptItem } from "./Transcript.js";

export function MessageBubble(props: { item: TranscriptItem }): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={props.item.role === "user" ? "cyan" : props.item.role === "error" ? "red" : "green"}>
        {props.item.role}
      </Text>
      <Text>{props.item.text}</Text>
    </Box>
  );
}
