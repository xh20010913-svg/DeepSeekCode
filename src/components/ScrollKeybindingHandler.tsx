import React from "react";

export function scrollKeybindingDelta(keyName: string): number {
  if (keyName === "up" || keyName === "k") return -1;
  if (keyName === "down" || keyName === "j") return 1;
  if (keyName === "pageup") return -10;
  if (keyName === "pagedown") return 10;
  return 0;
}

export function ScrollKeybindingHandler(props: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{props.children}</>;
}
