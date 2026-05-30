import React from "react";
import { Box, Text } from "ink";
import { summarizeDiff } from "../utils/diff.js";
import { DiffDetailView, parseDiffDetailFiles } from "./DiffDetailView.js";
import { DiffFileList } from "./DiffFileList.js";
import { DiffReviewChrome, type DiffReviewMode, type DiffReviewSource } from "./DiffReviewChrome.js";
import { DiffSummaryHeader } from "./DiffSummaryHeader.js";
import { truncateCells } from "./design/textLayout.js";

export interface DiffReviewPanelModel {
  title: string;
  subtitle: string;
  sourceLabel: string;
  files: number;
  added: number;
  removed: number;
  hunks: number;
  modeLabel: DiffReviewMode;
  selectedFileIndex: number;
  selectedFilePath: string;
  emptyMessage: string;
}

const DEFAULT_MAX_LINES = 220;
const DEFAULT_WIDTH = 112;

export function DiffReviewPanel(props: {
  diff: string;
  title?: string;
  subtitle?: string;
  sourceLabel?: string;
  sources?: DiffReviewSource[];
  selectedSourceIndex?: number;
  mode?: DiffReviewMode;
  selectedFileIndex?: number;
  maxLines?: number;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? DEFAULT_WIDTH;
  const model = diffReviewPanelModel({
    diff: props.diff,
    title: props.title,
    subtitle: props.subtitle,
    sourceLabel: props.sourceLabel,
    mode: props.mode,
    selectedFileIndex: props.selectedFileIndex,
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color="cyan" bold>
          {truncateCells(model.title, Math.max(20, width - 28))}
        </Text>
        <Box flexGrow={1} />
        <Text color="gray">{truncateCells(model.sourceLabel, 24)}</Text>
      </Box>
      {model.subtitle ? <Text color="gray">{truncateCells(model.subtitle, width)}</Text> : null}
      <Text color="gray">
        {model.modeLabel}
        {" | "}
        {`${model.files} file${model.files === 1 ? "" : "s"}`}
        {" | "}
        {`${model.hunks} hunk${model.hunks === 1 ? "" : "s"}`}
        {" | "}
        <Text color="green">{`+${model.added}`}</Text>
        {" "}
        <Text color="red">{`-${model.removed}`}</Text>
      </Text>
      <Box marginTop={1}>
        <DiffReviewChrome
          sources={props.sources ?? [{ label: model.sourceLabel }]}
          selectedSourceIndex={props.selectedSourceIndex}
          mode={model.modeLabel}
          width={width}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <DiffReviewContent
          diff={props.diff}
          model={model}
          maxLines={props.maxLines ?? DEFAULT_MAX_LINES}
          width={width}
        />
      </Box>
      <Text color="gray">{contentHint(model)}</Text>
    </Box>
  );
}

export function diffReviewPanelModel(input: {
  diff: string;
  title?: string;
  subtitle?: string;
  sourceLabel?: string;
  mode?: DiffReviewMode;
  selectedFileIndex?: number;
}): DiffReviewPanelModel {
  const summary = summarizeDiff(input.diff);
  const files = parseDiffDetailFiles(input.diff);
  const hunks = files.reduce((total, file) => total + file.hunks.length, 0);
  const selectedFileIndex = files.length > 0 ? clampIndex(input.selectedFileIndex ?? 0, files.length) : 0;
  const mode = input.mode ?? "review";
  return {
    title: input.title?.trim() || "Diff review",
    subtitle: input.subtitle?.trim() || "",
    sourceLabel: input.sourceLabel?.trim() || "workspace",
    files: files.length,
    added: summary.added,
    removed: summary.removed,
    hunks,
    modeLabel: mode,
    selectedFileIndex,
    selectedFilePath: files[selectedFileIndex]?.path ?? "",
    emptyMessage: files.length === 0 ? "Working tree is clean" : "",
  };
}

function DiffReviewContent(props: {
  diff: string;
  model: DiffReviewPanelModel;
  maxLines: number;
  width: number;
}): React.ReactElement {
  if (props.model.files === 0) {
    return <Text color="gray">{props.model.emptyMessage}</Text>;
  }

  if (props.model.modeLabel === "list") {
    return (
      <Box flexDirection="column">
        <DiffSummaryHeader diff={props.diff} />
        <DiffFileList diff={props.diff} width={props.width} selectedIndex={props.model.selectedFileIndex} />
      </Box>
    );
  }

  if (props.model.modeLabel === "detail") {
    return (
      <Box flexDirection="column">
        <Text color="gray">{`selected ${props.model.selectedFileIndex + 1}/${props.model.files}: ${props.model.selectedFilePath}`}</Text>
        <DiffDetailView
          diff={props.diff}
          selectedFileIndex={props.model.selectedFileIndex}
          maxLines={props.maxLines}
          width={props.width}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <DiffSummaryHeader diff={props.diff} />
      <DiffFileList diff={props.diff} width={props.width} selectedIndex={props.model.selectedFileIndex} />
      <DiffDetailView diff={props.diff} maxLines={props.maxLines} width={props.width} />
    </Box>
  );
}

function contentHint(model: DiffReviewPanelModel): string {
  if (model.files === 0) return "preview: no changed files";
  if (model.modeLabel === "list") return "list: select a file to inspect";
  if (model.modeLabel === "detail") return "detail: selected file hunk view";
  return "review: file list + hunk detail";
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}
