import React from "react";
import { Box, Text } from "ink";
import { diffLineColor } from "./StructuredDiff.js";
import { MarkdownTable, parseMarkdownTableBlock } from "./MarkdownTable.js";
import { HighlightedCode } from "./HighlightedCode.js";
import { OrderedList } from "./OrderedList.js";

export function Markdown(props: {
  children: string;
  dimColor?: boolean;
}): React.ReactElement {
  const lines = props.children.split(/\r?\n/);
  const elements: React.ReactElement[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const table = parseMarkdownTableBlock(lines, index, 96);
    if (table) {
      elements.push(<MarkdownTable key={`table-${index}`} model={table.model} width={96} />);
      index = table.endIndex;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const fenceLanguage = trimmed.replace(/^```/, "").trim().toLowerCase();
      const codeLines: string[] = [];
      let endIndex = index + 1;
      while (endIndex < lines.length) {
        const candidate = lines[endIndex] ?? "";
        if (candidate.trim().startsWith("```")) break;
        codeLines.push(candidate);
        endIndex += 1;
      }
      elements.push(
        <HighlightedCode
          key={`code-${index}`}
          code={codeLines.join("\n")}
          filePath={fenceLanguage || "text"}
          width={96}
          dim={props.dimColor}
        />,
      );
      index = endIndex < lines.length ? endIndex : lines.length - 1;
      continue;
    }
    if (isDiffLine(line)) {
      elements.push(
        <Text key={lineKey(index, line)} color={diffLineColor(line)}>
          {line || " "}
        </Text>,
      );
      continue;
    }
    if (trimmed.startsWith("#")) {
      elements.push(
        <Text key={lineKey(index, line)} color="cyan" bold>
          {trimmed.replace(/^#+\s*/, "")}
        </Text>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      elements.push(
        <Text key={lineKey(index, line)} color={props.dimColor ? "gray" : undefined}>
          {`  - ${trimmed.replace(/^[-*]\s+/, "")}`}
        </Text>,
      );
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const block = parseOrderedListBlock(lines, index);
      elements.push(
        <OrderedList key={`ordered-${index}`}>
          {block.items.map((item, itemIndex) => (
            <OrderedList.Item key={`${itemIndex}-${item.slice(0, 20)}`}>
              <Text color={props.dimColor ? "gray" : undefined}>{item}</Text>
            </OrderedList.Item>
          ))}
        </OrderedList>,
      );
      index = block.endIndex;
      continue;
    }
    if (trimmed.startsWith(">")) {
      elements.push(
        <Text key={lineKey(index, line)} color="gray">
          {trimmed}
        </Text>,
      );
      continue;
    }
    elements.push(
      <Text key={lineKey(index, line)} color={props.dimColor ? "gray" : undefined}>
        {line || " "}
      </Text>,
    );
  }
  return (
    <Box flexDirection="column">
      {elements}
    </Box>
  );
}

function lineKey(index: number, line: string): string {
  return `${index}:${line.slice(0, 24)}`;
}

function isDiffLine(line: string): boolean {
  return line.startsWith("@@") ||
    line.startsWith("+++") ||
    line.startsWith("---") ||
    /^\+[^\s+]/.test(line) ||
    /^-[^\s-]/.test(line);
}

export function parseOrderedListBlock(lines: string[], startIndex: number): {
  items: string[];
  endIndex: number;
} {
  const items: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();
    const match = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (!match) break;
    items.push(match[1] ?? "");
    index += 1;
  }
  return {
    items,
    endIndex: Math.max(startIndex, index - 1),
  };
}
