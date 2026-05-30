import React from "react";
import { Box } from "ink";

export interface VirtualMessageWindow<T> {
  visible: T[];
  hidden: number;
  rows: number;
}

export function VirtualMessageList<T>(props: {
  entries: T[];
  height: number;
  width: number;
  estimateRows(entry: T): number;
  renderEntry(entry: T, index: number): React.ReactNode;
  empty?: React.ReactNode;
}): React.ReactElement {
  const window = virtualMessageWindow(props.entries, props.height, props.estimateRows);
  return (
    <Box flexDirection="column" height={props.height} paddingX={1} width={props.width}>
      {window.visible.length === 0 && props.empty ? (
        props.empty
      ) : (
        window.visible.map((entry, index) => (
          <React.Fragment key={index}>
            {props.renderEntry(entry, index)}
          </React.Fragment>
        ))
      )}
    </Box>
  );
}

export function virtualMessageWindow<T>(
  entries: T[],
  height: number,
  estimateRows: (entry: T) => number,
): VirtualMessageWindow<T> {
  const selected: T[] = [];
  let rows = 0;
  const budget = Math.max(3, height);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const nextRows = rows + Math.max(1, estimateRows(entry));
    if (selected.length > 0 && nextRows > budget) break;
    selected.unshift(entry);
    rows = nextRows;
  }
  return {
    visible: selected,
    hidden: Math.max(0, entries.length - selected.length),
    rows,
  };
}
