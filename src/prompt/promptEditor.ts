export interface PromptEditorState {
  value: string;
  cursor: number;
}

export type PromptEditorAction =
  | { type: "insert"; text: string }
  | { type: "set"; value: string; cursor?: number | "start" | "end" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "deleteWordBefore" }
  | { type: "moveLeft" }
  | { type: "moveRight" }
  | { type: "moveStart" }
  | { type: "moveEnd" }
  | { type: "clearBefore" }
  | { type: "clearAfter" };

export function createPromptEditorState(value = "", cursor = value.length): PromptEditorState {
  return { value, cursor: clampCursor(value, cursor) };
}

export function updatePromptEditor(
  state: PromptEditorState,
  action: PromptEditorAction,
): PromptEditorState {
  const cursor = clampCursor(state.value, state.cursor);
  switch (action.type) {
    case "insert": {
      if (!action.text) return { ...state, cursor };
      const text = normalizeInsertedText(action.text);
      const value = state.value.slice(0, cursor) + text + state.value.slice(cursor);
      return { value, cursor: cursor + text.length };
    }
    case "set": {
      const nextCursor = action.cursor === "start"
        ? 0
        : action.cursor === "end" || action.cursor === undefined
          ? action.value.length
          : action.cursor;
      return createPromptEditorState(action.value, nextCursor);
    }
    case "backspace": {
      if (cursor <= 0) return { ...state, cursor };
      const value = state.value.slice(0, cursor - 1) + state.value.slice(cursor);
      return { value, cursor: cursor - 1 };
    }
    case "delete": {
      if (cursor >= state.value.length) return { ...state, cursor };
      const value = state.value.slice(0, cursor) + state.value.slice(cursor + 1);
      return { value, cursor };
    }
    case "deleteWordBefore": {
      const start = wordStartBefore(state.value, cursor);
      const value = state.value.slice(0, start) + state.value.slice(cursor);
      return { value, cursor: start };
    }
    case "moveLeft":
      return { ...state, cursor: Math.max(0, cursor - 1) };
    case "moveRight":
      return { ...state, cursor: Math.min(state.value.length, cursor + 1) };
    case "moveStart":
      return { ...state, cursor: 0 };
    case "moveEnd":
      return { ...state, cursor: state.value.length };
    case "clearBefore":
      return { value: state.value.slice(cursor), cursor: 0 };
    case "clearAfter":
      return { value: state.value.slice(0, cursor), cursor };
  }
}

export function clampCursor(value: string, cursor: number): number {
  if (!Number.isFinite(cursor)) return value.length;
  return Math.max(0, Math.min(value.length, Math.floor(cursor)));
}

export function normalizeInsertedText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function wordStartBefore(value: string, cursor: number): number {
  let index = cursor;
  while (index > 0 && /\s/.test(value[index - 1] ?? "")) index -= 1;
  while (index > 0 && !/\s/.test(value[index - 1] ?? "")) index -= 1;
  return index;
}
