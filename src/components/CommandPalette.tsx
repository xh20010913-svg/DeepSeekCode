import React from "react";
import { Box, Text } from "ink";
import {
  getCommandPaletteItems,
  type CommandPaletteItem,
} from "../prompt/commandPalette.js";
import type { Command } from "../types/command.js";
import { FuzzyPicker } from "./design/FuzzyPicker.js";
import { padRightCells, truncateCells } from "./design/textLayout.js";

export function CommandPalette(props: {
  commands: Command[];
  query: string;
  selectedIndex: number;
  width: number;
}): React.ReactElement {
  const commands = getCommandPaletteItems(props.commands, props.query, 9);
  return (
    <FuzzyPicker
      title="Command Palette"
      query={props.query}
      placeholder="Search commands"
      items={commands}
      selectedIndex={props.selectedIndex}
      width={props.width}
      emptyMessage="No matching commands"
      footer="Enter insert  Esc close  Up/Down select  Ctrl+U clear"
      getKey={(command) => command.id}
      renderItem={renderCommandRow}
      renderPreview={renderCommandPreview}
    />
  );
}

function renderCommandRow(command: CommandPaletteItem, selected: boolean): React.ReactNode {
  const usage = command.usage ? ` ${command.usage}` : "";
  return (
    <Text color={selected ? "white" : "gray"}>
      <Text color={selected ? "cyan" : "gray"}>{padRightCells(`/${command.name}${usage}`, 32)}</Text>
      {truncateCells(command.description, 62)}
    </Text>
  );
}

function renderCommandPreview(command: CommandPaletteItem): React.ReactNode {
  const aliases = command.aliases.length > 0 ? command.aliases.map((alias) => `/${alias}`).join(", ") : "none";
  const usage = command.usage ? `/${command.name} ${command.usage}` : `/${command.name}`;
  return (
    <Box flexDirection="column">
      <Text color="gray">usage <Text color="white">{usage}</Text></Text>
      <Text color="gray">aliases <Text color="white">{aliases}</Text></Text>
      <Text color="gray">match <Text color="white">{command.match}</Text></Text>
    </Box>
  );
}
