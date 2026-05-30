import React from "react";
import { Box, Text } from "ink";
import { toneColor, type TerminalTone } from "./design/terminalTheme.js";

export type MessageTone = Extract<TerminalTone, "default" | "success" | "warning" | "error">;

const MessageResponseContext = React.createContext(false);

export function MessageResponse(props: {
  children: React.ReactNode;
  tone?: MessageTone;
  height?: number;
}): React.ReactElement {
  const insideResponse = React.useContext(MessageResponseContext);
  if (insideResponse) return <>{props.children}</>;
  return (
    <MessageResponseContext.Provider value={true}>
      <Box flexDirection="row" height={props.height}>
        <Text color={toneColor(props.tone) ?? "gray"}>{"| "}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {props.children}
        </Box>
      </Box>
    </MessageResponseContext.Provider>
  );
}
