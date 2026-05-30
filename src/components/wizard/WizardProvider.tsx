import React from "react";

export function WizardProvider(props: { children: React.ReactNode }): React.ReactElement {
  return <>{props.children}</>;
}
