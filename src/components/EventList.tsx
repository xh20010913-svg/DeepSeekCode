import React from "react";
import { Box, Text } from "ink";
import type { EventRecord } from "../state/sqlite.js";

export function EventList(props: { events: EventRecord[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.events.length === 0 ? (
        <Text color="gray">No events</Text>
      ) : (
        props.events.map((event) => (
          <Text key={event.id}>{`${event.id} ${event.kind} ${event.runId ?? "-"}`}</Text>
        ))
      )}
    </Box>
  );
}
