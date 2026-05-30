import { useCallback, useMemo, useState } from "react";
import {
  createPromptEditorState,
  updatePromptEditor,
  type PromptEditorAction,
  type PromptEditorState,
} from "../prompt/promptEditor.js";

export interface PromptEditorController extends PromptEditorState {
  dispatch(action: PromptEditorAction): void;
  set(value: string, cursor?: number | "start" | "end"): void;
  reset(): void;
}

export function usePromptEditor(initialValue = ""): PromptEditorController {
  const [state, setState] = useState(() => createPromptEditorState(initialValue));
  const dispatch = useCallback((action: PromptEditorAction) => {
    setState((previous) => updatePromptEditor(previous, action));
  }, []);
  const set = useCallback((value: string, cursor?: number | "start" | "end") => {
    dispatch({ type: "set", value, cursor });
  }, [dispatch]);
  const reset = useCallback(() => {
    dispatch({ type: "set", value: "", cursor: 0 });
  }, [dispatch]);
  return useMemo(() => ({
    ...state,
    dispatch,
    set,
    reset,
  }), [dispatch, reset, set, state]);
}
