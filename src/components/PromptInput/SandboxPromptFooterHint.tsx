import React from "react";
import { Text } from "ink";

export function sandboxPromptFooterHint(shellEnabled: boolean, browserEnabled: boolean): string {
  if (shellEnabled && browserEnabled) return "shell/browser on";
  if (shellEnabled) return "shell on";
  if (browserEnabled) return "browser on";
  return "safe mode";
}

export function SandboxPromptFooterHint(props: {
  shellEnabled: boolean;
  browserEnabled: boolean;
}): React.ReactElement {
  return <Text color="gray">{sandboxPromptFooterHint(props.shellEnabled, props.browserEnabled)}</Text>;
}
