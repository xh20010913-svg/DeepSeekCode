import React from "react";
import type { SelectListOption } from "../design/SelectList.js";
import type { OptionWithDescription } from "./select.js";

export function optionValueKey<T>(value: T): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value == null) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function optionLabelText(value: React.ReactNode): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(optionLabelText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return optionLabelText(value.props.children);
  }
  return "";
}

export function optionToSelectListOption<T>(
  option: OptionWithDescription<T>,
  input: {
    selected?: boolean;
    focused?: boolean;
  } = {},
): SelectListOption {
  return {
    id: optionValueKey(option.value),
    label: optionLabelText(option.label) || optionValueKey(option.value),
    detail: option.description ?? "",
    description: option.type === "input" ? option.placeholder ?? "" : "",
    disabled: option.disabled,
    selected: input.selected ?? input.focused,
    tone: option.disabled ? "muted" : input.focused ? "brand" : undefined,
  };
}
