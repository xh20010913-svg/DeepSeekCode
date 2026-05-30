import React from "react";
import { Box, Text } from "ink";

export function Feed(props: { items: readonly string[] }): React.ReactElement {
  return <Box flexDirection="column">{props.items.map((item) => <Text key={item} color="gray">{item}</Text>)}</Box>;
}
