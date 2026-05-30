import type { KeybindingBlock } from "./types.js";

export const DEFAULT_BINDINGS: KeybindingBlock[] = [
  {
    context: "Global",
    bindings: {
      "ctrl+c": "app:interrupt",
      "ctrl+d": "app:exit",
      "ctrl+l": "app:redraw",
      "ctrl+o": "app:quickOpen",
      "ctrl+r": "history:search",
      "/": "command:slash",
      "?": "help:prompt",
    },
  },
  {
    context: "Chat",
    bindings: {
      enter: "chat:submit",
      "shift+enter": "chat:newline",
      escape: "chat:clearOrCancel",
      up: "history:previous",
      down: "history:next",
      "ctrl+a": "edit:lineStart",
      "ctrl+e": "edit:lineEnd",
      "ctrl+u": "edit:clearBeforeCursor",
      "ctrl+k": "edit:clearAfterCursor",
      "ctrl+w": "edit:deleteWordBeforeCursor",
      "ctrl+x ctrl+k": "chat:cancelQueued",
    },
  },
];
