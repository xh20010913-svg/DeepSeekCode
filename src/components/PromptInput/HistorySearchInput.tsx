import React from "react";
import { SearchBox } from "../SearchBox.js";

export function HistorySearchInput(props: {
  query: string;
  width: number;
}): React.ReactElement {
  return (
    <SearchBox
      query={props.query}
      placeholder="Search prompt history"
      isFocused
      isTerminalFocused
      prefix="/"
      width={props.width}
      borderless
    />
  );
}
