import React from "react";
import { Box, Text } from "ink";
import { compactPath } from "../commands/format.js";

export function SessionList(props: {
  sessions: Array<{ sessionId: string; path: string; bytes: number }>;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.sessions.length === 0 ? (
        <Text color="gray">No sessions</Text>
      ) : (
        props.sessions.map((session) => (
          <Text key={session.sessionId}>
            {`${session.sessionId} ${Math.round(session.bytes / 1024)}KB ${compactPath(session.path, 50)}`}
          </Text>
        ))
      )}
    </Box>
  );
}
