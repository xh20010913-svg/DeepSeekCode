import { useMemo } from "react";
import { getBindingDisplayText } from "./resolver.js";
import { useKeybindingContext } from "./KeybindingContext.js";

export function useKeybinding(action: string, context = "Global"): string | undefined {
  const bindings = useKeybindingContext();
  return useMemo(() => getBindingDisplayText(action, context, bindings), [action, context, bindings]);
}
