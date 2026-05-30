import { useCallback, useState } from "react";

export interface SelectInputState {
  value: string;
  cursor: number;
  setValue(value: string): void;
  reset(value?: string): void;
}

export function useSelectInput(initialValue = ""): SelectInputState {
  const [value, setInternalValue] = useState(initialValue);
  const setValue = useCallback((next: string) => {
    setInternalValue(next);
  }, []);
  const reset = useCallback((next = "") => {
    setInternalValue(next);
  }, []);
  return {
    value,
    cursor: value.length,
    setValue,
    reset,
  };
}
