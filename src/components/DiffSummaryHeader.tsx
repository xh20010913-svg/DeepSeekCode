import React from "react";
import { Box, Text } from "ink";
import { summarizeDiff } from "../utils/diff.js";

export interface DiffSummaryHeaderModel {
  added: number;
  removed: number;
  hunks: number;
  files: string[];
  clippedFiles: number;
}

const MAX_FILE_LABELS = 4;

export function DiffSummaryHeader(props: {
  diff: string;
  maxFiles?: number;
}): React.ReactElement {
  const model = diffSummaryHeaderModel(props.diff, props.maxFiles ?? MAX_FILE_LABELS);
  return (
    <Box flexDirection="column">
      <Text color="gray">
        {"diff "}
        <Text color="green">{`+${model.added}`}</Text>
        {" "}
        <Text color="red">{`-${model.removed}`}</Text>
        {` | files ${model.files.length + model.clippedFiles} | hunks ${model.hunks}`}
      </Text>
      {model.files.length > 0 ? (
        <Text color="gray">
          {model.files.join(", ")}
          {model.clippedFiles > 0 ? `, ... ${model.clippedFiles} more` : ""}
        </Text>
      ) : null}
    </Box>
  );
}

export function diffSummaryHeaderModel(diff: string, maxFiles = MAX_FILE_LABELS): DiffSummaryHeaderModel {
  const summary = summarizeDiff(diff);
  const files: string[] = [];
  let hunks = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      hunks += 1;
      continue;
    }

    const gitMatch = line.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/);
    if (gitMatch) {
      pushUnique(files, cleanDiffPath(gitMatch[2] ?? gitMatch[1] ?? ""));
      continue;
    }

    const plusMatch = line.match(/^\+\+\+\s+(.+)$/);
    if (plusMatch) {
      const filePath = cleanDiffPath(plusMatch[1] ?? "");
      if (filePath && filePath !== "/dev/null") pushUnique(files, filePath);
    }
  }

  const visibleFiles = files.slice(0, maxFiles);
  return {
    added: summary.added,
    removed: summary.removed,
    hunks,
    files: visibleFiles,
    clippedFiles: Math.max(0, files.length - visibleFiles.length),
  };
}

function pushUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value);
}

function cleanDiffPath(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (trimmed === "/dev/null") return trimmed;
  return trimmed.replace(/^[ab]\//, "");
}
