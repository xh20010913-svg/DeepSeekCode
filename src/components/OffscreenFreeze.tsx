import React from "react";

export function OffscreenFreeze(props: {
  frozen?: boolean;
  children: React.ReactNode;
}): React.ReactElement | null {
  return props.frozen ? null : <>{props.children}</>;
}
