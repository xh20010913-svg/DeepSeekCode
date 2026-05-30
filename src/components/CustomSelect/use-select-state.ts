import { useCallback, useState } from "react";
import type { OptionWithDescription } from "./select.js";
import { useSelectNavigation } from "./use-select-navigation.js";

export interface UseSelectStateProps<T> {
  visibleOptionCount?: number;
  options: OptionWithDescription<T>[];
  defaultValue?: T;
  onChange?: (value: T) => void;
  onCancel?: () => void;
  onFocus?: (value: T) => void;
  focusValue?: T;
}

export function useSelectState<T>(props: UseSelectStateProps<T>) {
  const [value, setValue] = useState<T | undefined>(props.defaultValue);
  const navigation = useSelectNavigation({
    visibleOptionCount: props.visibleOptionCount,
    options: props.options,
    initialFocusValue: props.defaultValue,
    onFocus: props.onFocus,
    focusValue: props.focusValue,
  });
  const selectFocusedOption = useCallback(() => {
    if (navigation.focusedValue === undefined) return;
    setValue(navigation.focusedValue);
    props.onChange?.(navigation.focusedValue);
  }, [navigation.focusedValue, props]);

  return {
    ...navigation,
    value,
    selectFocusedOption,
    onChange: props.onChange,
    onCancel: props.onCancel,
    isInInput: false,
  };
}
