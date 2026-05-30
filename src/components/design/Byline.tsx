import React from "react";
import { Box, Text } from "ink";

export function joinBylineItems(items: string[], separator = " | "): string {
  return items.map((item) => item.trim()).filter(Boolean).join(separator);
}

export function Byline(props: {
  children: React.ReactNode;
  separator?: string;
}): React.ReactElement {
  const children = React.Children.toArray(props.children).filter(Boolean);
  const separator = props.separator ?? " | ";

  return (
    <Box flexDirection="row">
      {children.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Text color="gray">{separator}</Text>}
          {child}
        </React.Fragment>
      ))}
    </Box>
  );
}
