import React, { createContext, useContext, type ReactNode } from "react";
import { Box, Text } from "ink";

export const OrderedListItemContext = createContext({ marker: "" });

export function OrderedListItem(props: {
  children: ReactNode;
}): React.ReactElement {
  const { marker } = useContext(OrderedListItemContext);
  return (
    <Box flexDirection="row">
      <Text color="gray">{marker}</Text>
      <Text> </Text>
      <Box flexDirection="column">{props.children}</Box>
    </Box>
  );
}
