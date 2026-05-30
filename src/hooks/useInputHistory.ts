import { useRef } from "react";
import { InputHistory } from "../history.js";

export function useInputHistory(limit = 100): InputHistory {
  const ref = useRef<InputHistory | null>(null);
  ref.current ??= new InputHistory(limit);
  return ref.current;
}
