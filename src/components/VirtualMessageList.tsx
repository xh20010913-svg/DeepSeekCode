import React from "react";
import { Box, Text } from "ink";

export interface VirtualMessageWindow<T> {
  visible: T[];
  hidden: number;
  hiddenAfter: number;
  rows: number;
}

export function VirtualMessageList<T>(props: {
  entries: T[];
  height: number;
  width: number;
  estimateRows(entry: T, width: number): number;
  renderEntry(entry: T, index: number): React.ReactNode;
  empty?: React.ReactNode;
  scrollOffset?: number;
}): React.ReactElement {
  const window = virtualMessageWindow(
    props.entries,
    props.height,
    props.width,
    props.estimateRows,
    props.scrollOffset,
  );
  return (
    <Box flexDirection="column" height={props.height} paddingX={1} width={props.width}>
      {window.visible.length === 0 && props.empty ? (
        props.empty
      ) : (
        <>
          {window.hidden > 0 && (
            <Box>
              <Text color="gray">{`^ ${window.hidden} earlier message${window.hidden === 1 ? "" : "s"} hidden`}</Text>
            </Box>
          )}
          {window.visible.map((entry, index) => (
            <React.Fragment key={index}>
              {props.renderEntry(entry, index)}
            </React.Fragment>
          ))}
          {window.hiddenAfter > 0 && (
            <Box>
              <Text color="gray">{`v ${window.hiddenAfter} newer message${window.hiddenAfter === 1 ? "" : "s"} hidden`}</Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export function virtualMessageWindow<T>(
  entries: T[],
  height: number,
  width: number,
  estimateRows: (entry: T, width: number) => number,
  scrollOffset = 0,
): VirtualMessageWindow<T> {
  const selected: T[] = [];
  let rows = 0;
  const budget = Math.max(3, height);
  const safeOffset = Math.max(0, Math.min(entries.length, Math.floor(scrollOffset)));
  const endExclusive = Math.max(0, entries.length - safeOffset);
  for (let index = endExclusive - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const nextRows = rows + Math.max(1, estimateRows(entry, width));
    if (selected.length > 0 && nextRows > budget) break;
    selected.unshift(entry);
    rows = nextRows;
  }
  return {
    visible: selected,
    hidden: Math.max(0, endExclusive - selected.length),
    hiddenAfter: Math.max(0, entries.length - endExclusive),
    rows,
  };
}
