import React from "react";
import { Text } from "ink";
import { cellWidth, createPromptViewportDisplay } from "../prompt/promptViewport.js";
import { takeCells } from "./design/textLayout.js";

export interface BaseTextInputModel {
  before: string;
  after: string;
  cursor: string;
  prefixHidden: boolean;
  suffixHidden: boolean;
  padding: string;
  placeholder: string;
  argumentHint: string;
}

export interface BaseTextInputModelInput {
  value: string;
  cursor: number;
  width: number;
  placeholder?: string;
  showCursor?: boolean;
  argumentHint?: string;
}

export function BaseTextInput(props: {
  model: BaseTextInputModel;
}): React.ReactElement {
  return (
    <Text>
      {props.model.prefixHidden && <Text color="gray">{"..."}</Text>}
      {props.model.placeholder ? (
        <>
          <Text color="cyan">{props.model.cursor}</Text>
          <Text color="gray">{props.model.placeholder}</Text>
        </>
      ) : (
        <>
          <Text>{props.model.before}</Text>
          <Text color="cyan">{props.model.cursor}</Text>
          <Text>{props.model.after}</Text>
          {props.model.argumentHint ? <Text color="gray">{props.model.argumentHint}</Text> : null}
        </>
      )}
      {props.model.suffixHidden && <Text color="gray">{"..."}</Text>}
      <Text>{props.model.padding}</Text>
    </Text>
  );
}

export function baseTextInputModel(input: BaseTextInputModelInput): BaseTextInputModel {
  const width = Math.max(1, Math.floor(input.width));
  const showCursor = input.showCursor ?? true;
  const cursor = showCursor ? "|" : "";
  if (!input.value && input.placeholder) {
    const placeholder = takeCells(input.placeholder, Math.max(0, width - cellWidth(cursor)));
    return {
      before: "",
      after: "",
      cursor,
      prefixHidden: false,
      suffixHidden: false,
      padding: " ".repeat(Math.max(0, width - cellWidth(cursor) - cellWidth(placeholder))),
      placeholder,
      argumentHint: "",
    };
  }

  const viewport = createPromptViewportDisplay(input.value, input.cursor, width);
  const rawArgumentHint = input.argumentHint && shouldShowArgumentHint(input.value)
    ? `${input.value.endsWith(" ") ? "" : " "}${input.argumentHint}`
    : "";
  const baseWidth =
    (viewport.prefixHidden ? 3 : 0) +
    cellWidth(viewport.before) +
    cellWidth(cursor) +
    cellWidth(viewport.after) +
    (viewport.suffixHidden ? 3 : 0);
  const argumentHint = takeCells(rawArgumentHint, Math.max(0, width - baseWidth));
  return {
    before: viewport.before,
    after: viewport.after,
    cursor,
    prefixHidden: viewport.prefixHidden,
    suffixHidden: viewport.suffixHidden,
    padding: " ".repeat(Math.max(0, width - baseWidth - cellWidth(argumentHint))),
    placeholder: "",
    argumentHint,
  };
}

function shouldShowArgumentHint(value: string): boolean {
  if (!value.startsWith("/")) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && (trimmed.indexOf(" ") === -1 || value.endsWith(" "));
}
