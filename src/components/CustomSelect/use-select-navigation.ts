import { useCallback, useMemo, useState } from "react";
import { optionValueKey } from "./option-map.js";
import type { OptionWithDescription } from "./select.js";

export interface SelectNavigationModel<T> {
  focusedValue: T | undefined;
  focusedIndex: number;
  visibleFromIndex: number;
  visibleToIndex: number;
  visibleOptions: Array<OptionWithDescription<T> & { index: number }>;
}

export interface UseSelectNavigationProps<T> {
  visibleOptionCount?: number;
  options: OptionWithDescription<T>[];
  initialFocusValue?: T;
  focusValue?: T;
  onFocus?: (value: T) => void;
}

export function selectNavigationModel<T>(input: {
  options: OptionWithDescription<T>[];
  focusedValue?: T;
  visibleOptionCount?: number;
  initialFocusLast?: boolean;
}): SelectNavigationModel<T> {
  const visibleCount = Math.max(1, input.visibleOptionCount ?? 5);
  const focusedIndex = resolveFocusIndex(input.options, input.focusedValue, input.initialFocusLast);
  const start = input.options.length <= visibleCount
    ? 0
    : Math.max(0, Math.min(focusedIndex - Math.floor(visibleCount / 2), input.options.length - visibleCount));
  const end = Math.min(input.options.length, start + visibleCount);
  return {
    focusedValue: focusedIndex >= 0 ? input.options[focusedIndex]?.value : undefined,
    focusedIndex: focusedIndex >= 0 ? focusedIndex + 1 : 0,
    visibleFromIndex: start,
    visibleToIndex: end,
    visibleOptions: input.options.slice(start, end).map((option, offset) => ({
      ...option,
      index: start + offset,
    })),
  };
}

export function useSelectNavigation<T>(props: UseSelectNavigationProps<T>) {
  const [internalFocusValue, setInternalFocusValue] = useState<T | undefined>(props.initialFocusValue);
  const focusedValue = props.focusValue ?? internalFocusValue;
  const model = useMemo(() => selectNavigationModel({
    options: props.options,
    focusedValue,
    visibleOptionCount: props.visibleOptionCount,
  }), [focusedValue, props.options, props.visibleOptionCount]);

  const focusOption = useCallback((value: T | undefined) => {
    setInternalFocusValue(value);
    if (value !== undefined) props.onFocus?.(value);
  }, [props]);

  const focusByDelta = useCallback((delta: number) => {
    const count = props.options.length;
    if (count === 0) return;
    const current = Math.max(0, model.focusedIndex - 1);
    const next = (current + delta + count) % count;
    focusOption(props.options[next]?.value);
  }, [focusOption, model.focusedIndex, props.options]);

  return {
    ...model,
    focusOption,
    focusNextOption: () => focusByDelta(1),
    focusPreviousOption: () => focusByDelta(-1),
    focusNextPage: () => focusByDelta(props.visibleOptionCount ?? 5),
    focusPreviousPage: () => focusByDelta(-(props.visibleOptionCount ?? 5)),
  };
}

function resolveFocusIndex<T>(
  options: OptionWithDescription<T>[],
  focusedValue: T | undefined,
  initialFocusLast?: boolean,
): number {
  if (options.length === 0) return -1;
  if (focusedValue !== undefined) {
    const key = optionValueKey(focusedValue);
    const index = options.findIndex((option) => optionValueKey(option.value) === key);
    if (index >= 0) return index;
  }
  const start = initialFocusLast ? options.length - 1 : 0;
  return Math.max(0, Math.min(options.length - 1, start));
}
