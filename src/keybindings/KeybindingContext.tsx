import React, { createContext, useContext } from "react";
import { DEFAULT_BINDINGS } from "./defaultBindings.js";
import type { KeybindingBlock } from "./types.js";

export const KeybindingContext = createContext<KeybindingBlock[]>(DEFAULT_BINDINGS);

export function useKeybindingContext(): KeybindingBlock[] {
  return useContext(KeybindingContext);
}
