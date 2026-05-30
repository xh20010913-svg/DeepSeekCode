import React from "react";
import { SelectList, type SelectListOption } from "../design/SelectList.js";
import { optionToSelectListOption, optionValueKey } from "./option-map.js";
import type { OptionWithDescription } from "./select.js";

export interface SelectMultiProps<T = string> {
  isDisabled?: boolean;
  visibleOptionCount?: number;
  options: OptionWithDescription<T>[];
  defaultValue?: T[];
  onCancel?: () => void;
  onChange?: (values: T[]) => void;
  onFocus?: (value: T) => void;
  focusValue?: T;
  submitButtonText?: string;
  onSubmit?: (values: T[]) => void;
  hideIndexes?: boolean;
  initialFocusLast?: boolean;
}

export function SelectMulti<T = string>(props: SelectMultiProps<T>): React.ReactElement {
  const selectedValues = props.defaultValue ?? [];
  const focusValue = props.focusValue ?? (props.initialFocusLast
    ? props.options[props.options.length - 1]?.value
    : props.options[0]?.value);
  const selectedIndex = focusValue === undefined
    ? -1
    : props.options.findIndex((option) => optionValueKey(option.value) === optionValueKey(focusValue));
  return (
    <SelectList
      options={multiSelectOptionsToList({
        options: props.options,
        selectedValues,
        focusedValue: focusValue,
      })}
      selectedIndex={selectedIndex}
      visibleCount={props.visibleOptionCount ?? 5}
      hideIndexes={props.hideIndexes}
    />
  );
}

export function multiSelectOptionsToList<T>(input: {
  options: OptionWithDescription<T>[];
  selectedValues: T[];
  focusedValue?: T;
}): SelectListOption[] {
  const selected = new Set(input.selectedValues.map(optionValueKey));
  const focusedKey = input.focusedValue === undefined ? undefined : optionValueKey(input.focusedValue);
  return input.options.map((option) => {
    const key = optionValueKey(option.value);
    return optionToSelectListOption(option, {
      selected: selected.has(key),
      focused: focusedKey !== undefined && key === focusedKey,
    });
  });
}

export default SelectMulti;
