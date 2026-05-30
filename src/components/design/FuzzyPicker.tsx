import React from "react";
import { Box, Text } from "ink";
import { SearchBox } from "../SearchBox.js";
import { Pane } from "./Pane.js";
import type { TerminalTone } from "./terminalTheme.js";

export interface FuzzyPickerProps<T> {
  title: string;
  query: string;
  placeholder: string;
  items: T[];
  selectedIndex: number;
  width: number;
  emptyMessage: string;
  footer?: string;
  tone?: TerminalTone;
  getKey(item: T): string;
  renderItem(item: T, selected: boolean): React.ReactNode;
  renderPreview?(item: T): React.ReactNode;
}

export function FuzzyPicker<T>(props: FuzzyPickerProps<T>): React.ReactElement {
  const width = Math.max(42, Math.min(props.width - 2, 104));
  const selected = props.items[props.selectedIndex];
  return (
    <Box flexDirection="column" paddingX={1} paddingBottom={1}>
      <Pane title={props.title} tone={props.tone ?? "brand"} width={width}>
        <SearchBox
          query={props.query}
          placeholder={props.placeholder}
          isFocused={true}
          isTerminalFocused={true}
          prefix="/"
          width={width - 4}
          borderless
        />
        <Box flexDirection="column" marginTop={1}>
          {props.items.length === 0 ? (
            <Text color="yellow">{props.emptyMessage}</Text>
          ) : (
            props.items.map((item, index) => {
              const selectedRow = index === props.selectedIndex;
              return (
                <Box key={props.getKey(item)} flexDirection="row">
                  <Text color={selectedRow ? "cyan" : "gray"} inverse={selectedRow}>
                    {selectedRow ? ">" : " "}
                  </Text>
                  <Text> </Text>
                  <Box flexGrow={1}>
                    {props.renderItem(item, selectedRow)}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
        {selected && props.renderPreview && (
          <Box flexDirection="column" marginTop={1}>
            {props.renderPreview(selected)}
          </Box>
        )}
        {props.footer && (
          <Box marginTop={1}>
            <Text color="gray">{props.footer}</Text>
          </Box>
        )}
      </Pane>
    </Box>
  );
}
