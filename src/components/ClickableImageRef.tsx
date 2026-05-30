import React from "react";
import { Text } from "ink";

export function imageRefLabel(path: string): string {
  return `image ${path.trim() || "attached"}`;
}

export function ClickableImageRef(props: { path: string }): React.ReactElement {
  return <Text color="cyan">{imageRefLabel(props.path)}</Text>;
}
