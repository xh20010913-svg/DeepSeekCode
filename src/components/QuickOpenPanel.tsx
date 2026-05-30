import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Box, Text } from "ink";
import {
  getQuickOpenItems,
  type QuickOpenFile,
  type QuickOpenItem,
} from "../prompt/quickOpen.js";
import { FuzzyPicker } from "./design/FuzzyPicker.js";
import { flattenCellText, padRightCells, truncateCells } from "./design/textLayout.js";

export function QuickOpenPanel(props: {
  projectPath: string;
  files: QuickOpenFile[];
  query: string;
  selectedIndex: number;
  width: number;
}): React.ReactElement {
  const items = getQuickOpenItems(props.files, props.query, 9);
  return (
    <FuzzyPicker
      title="Quick Open"
      query={props.query}
      placeholder="Search project files"
      items={items}
      selectedIndex={props.selectedIndex}
      width={props.width}
      emptyMessage={props.files.length === 0 ? "No project files found" : "No matching files"}
      footer="Enter mention  Tab insert path  Esc close  Up/Down select"
      tone="brand"
      getKey={(item) => item.id}
      renderItem={renderFileRow}
      renderPreview={(item) => renderFilePreview(props.projectPath, item)}
    />
  );
}

function renderFileRow(item: QuickOpenItem, selected: boolean): React.ReactNode {
  return (
    <Text color={selected ? "white" : "gray"}>
      <Text color={selected ? "cyan" : "gray"}>{padRightCells(item.name, 30)}</Text>
      {truncateCells(item.folder, 44)}
      <Text color="gray">{`  ${item.sizeLabel}`}</Text>
    </Text>
  );
}

function renderFilePreview(projectPath: string, item: QuickOpenItem): React.ReactNode {
  const preview = readPreview(projectPath, item.path);
  return (
    <Box flexDirection="column">
      <Text color="gray">
        path <Text color="white">{truncateCells(item.path, 94)}</Text>
      </Text>
      <Text color="gray">
        match <Text color="white">{item.match}</Text>
        {"  "}
        size <Text color="white">{item.sizeLabel}</Text>
      </Text>
      {preview.map((line, index) => (
        <Text key={`${index}:${line}`} color="gray">
          {truncateCells(flattenCellText(line), 96)}
        </Text>
      ))}
    </Box>
  );
}

function readPreview(projectPath: string, relativePath: string): string[] {
  try {
    const root = path.resolve(projectPath);
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root + path.sep) && target !== root) return ["(preview unavailable)"];
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 256 * 1024) return ["(preview skipped)"];
    const buffer = fs.readFileSync(target);
    if (buffer.includes(0)) return ["(binary preview skipped)"];
    const text = buffer.toString("utf8");
    return text.split(/\r?\n/).slice(0, 8).filter((line) => line.trim() !== "");
  } catch {
    return ["(preview unavailable)"];
  }
}
