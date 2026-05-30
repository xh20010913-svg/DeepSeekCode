import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "./design/textLayout.js";
import { toneColor } from "./design/terminalTheme.js";

export interface TagTabPart {
  id: string;
  label: string;
  selected: boolean;
  hidden?: boolean;
}

export interface TagTabsModel {
  prefix: string;
  parts: TagTabPart[];
  hiddenLeft: number;
  hiddenRight: number;
  hint: string;
}

export function TagTabs(props: {
  tags: string[];
  selectedIndex?: number;
  availableWidth: number;
  prefix?: string;
}): React.ReactElement | null {
  const model = tagTabsModel(props.tags, {
    selectedIndex: props.selectedIndex,
    availableWidth: props.availableWidth,
    prefix: props.prefix,
  });
  if (model.parts.length === 0) return null;
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={toneColor("brand")}>{model.prefix}</Text>
      {model.hiddenLeft > 0 ? <Text color="gray">{`<${model.hiddenLeft}`}</Text> : null}
      {model.parts.map((part) => (
        <Text
          key={part.id}
          inverse={part.selected}
          bold={part.selected}
          color={part.selected ? undefined : toneColor("muted")}
        >
          {` ${part.label} `}
        </Text>
      ))}
      {model.hiddenRight > 0 ? <Text color="gray">{`${model.hiddenRight}>`}</Text> : null}
      <Text color="gray">{model.hint}</Text>
    </Box>
  );
}

export function tagTabsModel(
  tags: string[],
  options: {
    selectedIndex?: number;
    availableWidth: number;
    prefix?: string;
  },
): TagTabsModel {
  const normalized = uniqueTags(tags);
  if (normalized.length === 0) {
    return {
      prefix: options.prefix ?? "tags",
      parts: [],
      hiddenLeft: 0,
      hiddenRight: 0,
      hint: "",
    };
  }

  const selectedIndex = clampIndex(options.selectedIndex ?? 0, normalized.length);
  const prefix = options.prefix ?? "tags";
  const hint = "(tab to cycle)";
  const reserved = prefix.length + hint.length + 8;
  const maxWidth = Math.max(12, options.availableWidth - reserved);
  const singleMax = Math.max(8, Math.min(24, Math.floor(maxWidth / 2)));
  const widths = normalized.map((tag) => tabWidth(tag, singleMax));

  let start = selectedIndex;
  let end = selectedIndex + 1;
  let used = widths[selectedIndex] ?? 0;
  while (start > 0 || end < normalized.length) {
    const leftWidth = start > 0 ? (widths[start - 1] ?? 0) + 1 : Number.POSITIVE_INFINITY;
    const rightWidth = end < normalized.length ? (widths[end] ?? 0) + 1 : Number.POSITIVE_INFINITY;
    if (leftWidth <= rightWidth && used + leftWidth <= maxWidth) {
      start--;
      used += leftWidth;
      continue;
    }
    if (used + rightWidth <= maxWidth) {
      end++;
      used += rightWidth;
      continue;
    }
    break;
  }

  return {
    prefix,
    parts: normalized.slice(start, end).map((tag, offset) => {
      const index = start + offset;
      return {
        id: tag,
        label: tag === "All" ? "All" : `#${truncateCells(tag, singleMax - 3)}`,
        selected: index === selectedIndex,
      };
    }),
    hiddenLeft: start,
    hiddenRight: normalized.length - end,
    hint,
  };
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result = ["All"];
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(index)));
}

function tabWidth(tag: string, maxWidth: number): number {
  const label = tag === "All" ? "All" : `#${truncateCells(tag, maxWidth - 3)}`;
  return label.length + 2;
}
