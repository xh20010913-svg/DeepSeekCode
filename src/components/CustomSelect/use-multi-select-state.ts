import { useCallback, useState } from "react";
import { optionValueKey } from "./option-map.js";
import type { OptionWithDescription } from "./select.js";
import { useSelectNavigation } from "./use-select-navigation.js";

export interface UseMultiSelectStateProps<T> {
  visibleOptionCount?: number;
  options: OptionWithDescription<T>[];
  defaultValue?: T[];
  onChange?: (values: T[]) => void;
  onFocus?: (value: T) => void;
  focusValue?: T;
  initialFocusLast?: boolean;
}

export function useMultiSelectState<T>(props: UseMultiSelectStateProps<T>) {
  const [selectedValues, setSelectedValues] = useState<T[]>(props.defaultValue ?? []);
  const navigation = useSelectNavigation({
    visibleOptionCount: props.visibleOptionCount,
    options: props.options,
    initialFocusValue: props.initialFocusLast ? props.options[props.options.length - 1]?.value : props.options[0]?.value,
    onFocus: props.onFocus,
    focusValue: props.focusValue,
  });
  const toggleFocusedOption = useCallback(() => {
    if (navigation.focusedValue === undefined) return;
    const focusedKey = optionValueKey(navigation.focusedValue);
    const next = selectedValues.some((value) => optionValueKey(value) === focusedKey)
      ? selectedValues.filter((value) => optionValueKey(value) !== focusedKey)
      : [...selectedValues, navigation.focusedValue];
    setSelectedValues(next);
    props.onChange?.(next);
  }, [navigation.focusedValue, props, selectedValues]);

  return {
    ...navigation,
    selectedValues,
    toggleFocusedOption,
    isSubmitFocused: false,
  };
}
