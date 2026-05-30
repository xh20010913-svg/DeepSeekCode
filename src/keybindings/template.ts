export function keybindingTemplate(): string {
  return JSON.stringify([
    {
      context: "Chat",
      bindings: {
        "ctrl+o": "app:quickOpen",
        "ctrl+r": "history:search",
      },
    },
  ], null, 2);
}
