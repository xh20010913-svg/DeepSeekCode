import React from "react";
import { loadKeybindingsSync } from "./loadUserBindings.js";
import { KeybindingContext } from "./KeybindingContext.js";

export function KeybindingProviderSetup(props: {
  projectPath?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <KeybindingContext.Provider value={loadKeybindingsSync(props.projectPath)}>
      {props.children}
    </KeybindingContext.Provider>
  );
}
