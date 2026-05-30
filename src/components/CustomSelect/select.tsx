import React from "react";
import { SelectList, type SelectListOption } from "../design/SelectList.js";
import { optionToSelectListOption, optionValueKey } from "./option-map.js";

export type OptionWithDescription<T = string> = {
  description?: string;
  dimDescription?: boolean;
  label: React.ReactNode;
  value: T;
  disabled?: boolean;
} & ({
  type?: "text";
} | {
  type: "input";
  onChange: (value: string) => void;
  placeholder?: string;
  initialValue?: string;
  allowEmptySubmitToCancel?: boolean;
  showLabelWithValue?: boolean;
  labelValueSeparator?: string;
  resetCursorOnUpdate?: boolean;
});

export interface SelectProps<T = string> {
  isDisabled?: boolean;
  disableSelection?: boolean;
  hideIndexes?: boolean;
  visibleOptionCount?: number;
  options: OptionWithDescription<T>[];
  defaultValue?: T;
  defaultFocusValue?: T;
  focusValue?: T;
  onCancel?: () => void;
  onChange?: (value: T) => void;
  onFocus?: (value: T) => void;
  layout?: "compact" | "expanded" | "compact-vertical";
  inlineDescriptions?: boolean;
}

export function Select<T = string>(props: SelectProps<T>): React.ReactElement {
  const selectedIndex = selectFocusIndex({
    options: props.options,
    selectedValue: props.focusValue ?? props.defaultFocusValue ?? props.defaultValue,
  });
  return (
    <SelectList
      options={selectOptionsToList({
        options: props.options,
        selectedValue: props.defaultValue,
        focusedValue: props.focusValue ?? props.defaultFocusValue ?? props.defaultValue,
      })}
      selectedIndex={selectedIndex}
      visibleCount={props.visibleOptionCount ?? 5}
      hideIndexes={props.hideIndexes}
    />
  );
}

export function selectOptionsToList<T>(input: {
  options: OptionWithDescription<T>[];
  selectedValue?: T;
  focusedValue?: T;
}): SelectListOption[] {
  const selectedKey = input.selectedValue === undefined ? undefined : optionValueKey(input.selectedValue);
  const focusedKey = input.focusedValue === undefined ? selectedKey : optionValueKey(input.focusedValue);
  return input.options.map((option) => {
    const key = optionValueKey(option.value);
    return optionToSelectListOption(option, {
      selected: selectedKey !== undefined && key === selectedKey,
      focused: focusedKey !== undefined && key === focusedKey,
    });
  });
}

export function selectFocusIndex<T>(input: {
  options: OptionWithDescription<T>[];
  selectedValue?: T;
}): number {
  if (input.options.length === 0) return -1;
  const selectedKey = input.selectedValue === undefined ? undefined : optionValueKey(input.selectedValue);
  const selectedIndex = selectedKey === undefined
    ? -1
    : input.options.findIndex((option) => optionValueKey(option.value) === selectedKey);
  if (selectedIndex >= 0 && !input.options[selectedIndex]?.disabled) return selectedIndex;
  const firstEnabled = input.options.findIndex((option) => !option.disabled);
  return firstEnabled >= 0 ? firstEnabled : 0;
}

export default Select;
