import React from "react";
import { Box, Text } from "ink";
import { Byline, joinBylineItems } from "./Byline.js";
import { KeyboardShortcutHint } from "./KeyboardShortcutHint.js";
import { Pane } from "./Pane.js";
import { StatusBadge } from "./StatusBadge.js";
import { truncateCells } from "./textLayout.js";
import { toneColor, type TerminalTone } from "./terminalTheme.js";
import { useTerminalSize } from "../../hooks/useTerminalSize.js";

export interface DialogGuideItem {
  shortcut: string;
  action: string;
}

export function formatDialogGuide(items: DialogGuideItem[]): string {
  return joinBylineItems(items.map((item) => `${item.shortcut} to ${item.action}`));
}

export function clampDialogWidth(width: number | undefined, terminalColumns: number): number {
  const available = Math.max(40, terminalColumns - 4);
  const requested = width ?? Math.min(88, available);
  return Math.max(40, Math.min(requested, available));
}

export function Dialog(props: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  tone?: TerminalTone;
  statusLabel?: string;
  statusTone?: TerminalTone;
  meta?: string;
  paneTitle?: string;
  hideInputGuide?: boolean;
  hideBorder?: boolean;
  inputGuide?: React.ReactNode;
  guideItems?: DialogGuideItem[];
}): React.ReactElement {
  const { columns } = useTerminalSize();
  const width = clampDialogWidth(props.width, columns);
  const content = (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column">
          {renderTitle(props.title, props.tone)}
          {props.subtitle ? renderSubtitle(props.subtitle, width) : null}
        </Box>
        {props.statusLabel || props.meta ? (
          <Box flexDirection="column" alignItems="flex-end">
            {props.statusLabel ? (
              <StatusBadge label={props.statusLabel} tone={props.statusTone ?? props.tone} />
            ) : null}
            {props.meta ? <Text color="gray">{truncateCells(props.meta, Math.max(12, width - 34))}</Text> : null}
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {props.children}
      </Box>
      {props.hideInputGuide ? null : renderInputGuide(props)}
    </Box>
  );

  if (props.hideBorder) {
    return content;
  }

  return (
    <Pane width={width} title={props.paneTitle ?? "dialog"} tone={props.tone ?? "brand"} paddingX={1}>
      {content}
    </Pane>
  );
}

function renderTitle(title: React.ReactNode, tone: TerminalTone | undefined): React.ReactNode {
  if (typeof title === "string" || typeof title === "number") {
    return <Text bold color={toneColor(tone ?? "brand")}>{title}</Text>;
  }
  return title;
}

function renderSubtitle(subtitle: React.ReactNode, width: number): React.ReactNode {
  if (typeof subtitle === "string" || typeof subtitle === "number") {
    return <Text color="gray">{truncateCells(String(subtitle), Math.max(24, width - 12))}</Text>;
  }
  return subtitle;
}

function renderInputGuide(props: {
  inputGuide?: React.ReactNode;
  guideItems?: DialogGuideItem[];
}): React.ReactNode {
  if (props.inputGuide) {
    return (
      <Box marginTop={1}>
        {typeof props.inputGuide === "string" || typeof props.inputGuide === "number"
          ? <Text color="gray">{props.inputGuide}</Text>
          : props.inputGuide}
      </Box>
    );
  }

  if (!props.guideItems || props.guideItems.length === 0) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Byline>
        {props.guideItems.map((item) => (
          <KeyboardShortcutHint key={`${item.shortcut}:${item.action}`} shortcut={item.shortcut} action={item.action} />
        ))}
      </Byline>
    </Box>
  );
}
