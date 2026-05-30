import React from "react";
import {
  BaseTextInput,
  baseTextInputModel,
  type BaseTextInputModelInput,
} from "./BaseTextInput.js";

export type TextInputProps = BaseTextInputModelInput;

export function TextInput(props: TextInputProps): React.ReactElement {
  return <BaseTextInput model={baseTextInputModel(props)} />;
}

export default TextInput;
