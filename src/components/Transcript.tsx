import React from "react";
import type { ReactNode } from "react";
import { Box } from "ink";
import {
  estimateTranscriptRows,
  TranscriptMessage,
  type TranscriptMessageItem,
  type TranscriptRole,
} from "./TranscriptMessage.js";
import {
  estimateToolActivityGroupRows,
  ToolActivityGroup,
  type ToolActivitySourceItem,
} from "./ToolActivityGroup.js";
import { VirtualMessageList, virtualMessageWindow } from "./VirtualMessageList.js";
import { WelcomePanel } from "./WelcomePanel.js";
import type { UiLanguage } from "../services/ui/languageService.js";

export interface TranscriptItem extends TranscriptMessageItem {
  display?: ReactNode;
}

export type TranscriptDisplayEntry =
  | { kind: "item"; item: TranscriptItem }
  | { kind: "tool-group"; items: ToolActivitySourceItem[] };

export function Transcript(props: {
  items: TranscriptItem[];
  height: number;
  width: number;
  providerReady: boolean;
  model: string;
  projectPath: string;
  permissionProfile: string;
  shellEnabled: boolean;
  browserEnabled: boolean;
  scrollOffset?: number;
  language?: UiLanguage;
}): React.ReactElement {
  const entries = groupTranscriptItems(props.items);
  return (
    <VirtualMessageList
      entries={entries}
      height={props.height}
      width={props.width}
      estimateRows={estimateRows}
      empty={(
        <WelcomePanel
          width={props.width}
          providerReady={props.providerReady}
          model={props.model}
          projectPath={props.projectPath}
          permissionProfile={props.permissionProfile}
          shellEnabled={props.shellEnabled}
          browserEnabled={props.browserEnabled}
          language={props.language}
        />
      )}
      scrollOffset={props.scrollOffset}
      language={props.language}
      renderEntry={(entry, index) => renderTranscriptEntry(entry, index, props.width)}
    />
  );
}

export function groupTranscriptItems(items: TranscriptItem[]): TranscriptDisplayEntry[] {
  const entries: TranscriptDisplayEntry[] = [];
  let toolBatch: ToolActivitySourceItem[] = [];

  function flushToolBatch(): void {
    if (toolBatch.length >= 3) {
      entries.push({ kind: "tool-group", items: toolBatch });
    } else {
      for (const item of toolBatch) {
        entries.push({ kind: "item", item });
      }
    }
    toolBatch = [];
  }

  for (const item of items) {
    if (isToolActivityRole(item.role)) {
      toolBatch.push({ role: item.role, text: item.text });
      continue;
    }
    flushToolBatch();
    entries.push({ kind: "item", item });
  }
  flushToolBatch();
  return entries;
}

export function selectVisibleEntries(entries: TranscriptDisplayEntry[], height: number): TranscriptDisplayEntry[] {
  return virtualMessageWindow(entries, height, 80, estimateRows).visible;
}

function estimateRows(entry: TranscriptDisplayEntry, width: number): number {
  if (entry.kind === "tool-group") return estimateToolActivityGroupRows(entry.items);
  return estimateTranscriptRows(entry.item, width);
}

function renderTranscriptEntry(
  entry: TranscriptDisplayEntry,
  index: number,
  width: number,
): React.ReactNode {
  if (entry.kind === "tool-group") {
    return (
      <Box key={`${index}-tool-group`} flexDirection="column" marginBottom={1}>
        <ToolActivityGroup items={entry.items} detailWidth={Math.max(24, width - 12)} />
      </Box>
    );
  }
  if (entry.item.role === "display" && entry.item.display) {
    return (
      <Box key={`${index}-${entry.item.role}`} flexDirection="column" marginBottom={1}>
        {entry.item.display}
      </Box>
    );
  }
  return (
    <TranscriptMessage
      key={`${index}-${entry.item.role}`}
      item={entry.item}
      width={Math.max(24, width - 2)}
    />
  );
}

function isToolActivityRole(role: TranscriptRole): role is ToolActivitySourceItem["role"] {
  return role === "tool" || role === "tool-start";
}
