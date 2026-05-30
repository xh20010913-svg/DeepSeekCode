import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "./design/textLayout.js";

export interface DiffFileEntry {
  path: string;
  added: number;
  removed: number;
  hunks: number;
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
}

export interface DiffFileWindow {
  startIndex: number;
  endIndex: number;
  above: number;
  below: number;
  visible: DiffFileEntry[];
}

const DEFAULT_MAX_VISIBLE = 5;
const DEFAULT_WIDTH = 88;

export function DiffFileList(props: {
  diff: string;
  selectedIndex?: number;
  maxVisible?: number;
  width?: number;
}): React.ReactElement | null {
  const files = parseDiffFileEntries(props.diff);
  if (files.length === 0) return null;

  const selectedIndex = clampIndex(props.selectedIndex ?? 0, files.length);
  const model = diffFileWindow(files, selectedIndex, props.maxVisible ?? DEFAULT_MAX_VISIBLE);
  const statsWidth = 20;
  const pointerWidth = 2;
  const pathWidth = Math.max(18, (props.width ?? DEFAULT_WIDTH) - statsWidth - pointerWidth - 3);

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {model.above > 0 ? <Text color="gray">{`^ ${model.above} more changed file${model.above === 1 ? "" : "s"}`}</Text> : null}
      {model.visible.map((file, index) => {
        const absoluteIndex = model.startIndex + index;
        const selected = absoluteIndex === selectedIndex;
        return <DiffFileRow key={`${absoluteIndex}:${file.path}`} file={file} selected={selected} pathWidth={pathWidth} />;
      })}
      {model.below > 0 ? <Text color="gray">{`v ${model.below} more changed file${model.below === 1 ? "" : "s"}`}</Text> : null}
    </Box>
  );
}

export function parseDiffFileEntries(diff: string): DiffFileEntry[] {
  const files: DiffFileEntry[] = [];
  let current: DiffFileEntry | undefined;
  let previousPath = "";

  const finishCurrent = () => {
    if (!current) return;
    if (current.path || current.added > 0 || current.removed > 0 || current.hunks > 0 || current.isBinary) {
      files.push({
        ...current,
        path: current.path || previousPath || "unknown",
      });
    }
    current = undefined;
    previousPath = "";
  };

  const ensureCurrent = (path = ""): DiffFileEntry => {
    if (!current) current = createDiffFileEntry(path);
    if (path && current.path !== path) current.path = path;
    return current;
  };

  for (const line of diff.split(/\r?\n/)) {
    const gitMatch = line.match(/^diff --git\s+(.+?)\s+(.+)$/);
    if (gitMatch) {
      finishCurrent();
      const oldPath = cleanDiffPath(gitMatch[1] ?? "");
      const newPath = cleanDiffPath(gitMatch[2] ?? "");
      previousPath = oldPath === "/dev/null" ? "" : oldPath;
      current = createDiffFileEntry(newPath && newPath !== "/dev/null" ? newPath : previousPath);
      continue;
    }

    if (line.startsWith("new file mode")) {
      ensureCurrent(previousPath).isNew = true;
      continue;
    }

    if (line.startsWith("deleted file mode")) {
      ensureCurrent(previousPath).isDeleted = true;
      continue;
    }

    const renameFromMatch = line.match(/^rename from\s+(.+)$/);
    if (renameFromMatch) {
      const file = ensureCurrent(cleanDiffPath(renameFromMatch[1] ?? ""));
      file.isRenamed = true;
      previousPath = file.path;
      continue;
    }

    const renameToMatch = line.match(/^rename to\s+(.+)$/);
    if (renameToMatch) {
      const file = ensureCurrent(cleanDiffPath(renameToMatch[1] ?? ""));
      file.isRenamed = true;
      continue;
    }

    if (line.startsWith("Binary files ")) {
      ensureCurrent(previousPath).isBinary = true;
      continue;
    }

    const oldFileMatch = line.match(/^---\s+(.+)$/);
    if (oldFileMatch) {
      const path = cleanDiffPath(oldFileMatch[1] ?? "");
      if (path === "/dev/null") {
        ensureCurrent().isNew = true;
      } else {
        previousPath = path;
        ensureCurrent(path);
      }
      continue;
    }

    const newFileMatch = line.match(/^\+\+\+\s+(.+)$/);
    if (newFileMatch) {
      const path = cleanDiffPath(newFileMatch[1] ?? "");
      if (path === "/dev/null") {
        const file = ensureCurrent(previousPath);
        file.isDeleted = true;
      } else {
        ensureCurrent(path);
      }
      continue;
    }

    if (line.startsWith("@@")) {
      ensureCurrent(previousPath).hunks += 1;
      continue;
    }

    if (line.startsWith("+")) {
      ensureCurrent(previousPath).added += 1;
      continue;
    }

    if (line.startsWith("-")) {
      ensureCurrent(previousPath).removed += 1;
    }
  }

  finishCurrent();
  return files;
}

export function diffFileWindow(
  files: DiffFileEntry[],
  selectedIndex = 0,
  maxVisible = DEFAULT_MAX_VISIBLE,
): DiffFileWindow {
  if (files.length === 0) {
    return { startIndex: 0, endIndex: 0, above: 0, below: 0, visible: [] };
  }

  const visibleCount = Math.max(1, maxVisible);
  const selected = clampIndex(selectedIndex, files.length);
  let startIndex = Math.max(0, selected - Math.floor(visibleCount / 2));
  let endIndex = startIndex + visibleCount;

  if (endIndex > files.length) {
    endIndex = files.length;
    startIndex = Math.max(0, endIndex - visibleCount);
  }

  return {
    startIndex,
    endIndex,
    above: startIndex,
    below: Math.max(0, files.length - endIndex),
    visible: files.slice(startIndex, endIndex),
  };
}

export function formatDiffFileStats(file: DiffFileEntry): string {
  const labels: string[] = [];
  if (file.isNew) labels.push("new");
  if (file.isDeleted) labels.push("deleted");
  if (file.isRenamed) labels.push("renamed");
  if (file.isBinary) labels.push("binary");

  const stats: string[] = [];
  if (file.added > 0) stats.push(`+${file.added}`);
  if (file.removed > 0) stats.push(`-${file.removed}`);
  if (file.hunks > 0) stats.push(`${file.hunks} hunk${file.hunks === 1 ? "" : "s"}`);

  return [...stats, ...labels].join(" | ") || "no line changes";
}

function DiffFileRow(props: {
  file: DiffFileEntry;
  selected: boolean;
  pathWidth: number;
}): React.ReactElement {
  const pointer = props.selected ? "> " : "  ";
  const path = truncateCells(props.file.path, props.pathWidth);

  return (
    <Box flexDirection="row">
      <Text color={props.selected ? "cyan" : undefined} bold={props.selected}>
        {pointer}
        {path}
      </Text>
      <Box flexGrow={1} />
      <DiffFileStats file={props.file} selected={props.selected} />
    </Box>
  );
}

function DiffFileStats(props: { file: DiffFileEntry; selected: boolean }): React.ReactElement {
  const { file, selected } = props;
  const muted = !selected;

  if (file.isBinary) {
    return (
      <Text color="gray" italic>
        binary
      </Text>
    );
  }

  const status = file.isNew ? "new" : file.isDeleted ? "deleted" : file.isRenamed ? "renamed" : "";

  return (
    <Text>
      {file.added > 0 ? (
        <Text color="green" bold={selected}>
          +{file.added}
        </Text>
      ) : null}
      {file.added > 0 && file.removed > 0 ? " " : ""}
      {file.removed > 0 ? (
        <Text color="red" bold={selected}>
          -{file.removed}
        </Text>
      ) : null}
      {file.hunks > 0 ? <Text color="gray">{`${file.added + file.removed > 0 ? " " : ""}${file.hunks}h`}</Text> : null}
      {status ? <Text color="gray">{`${file.added + file.removed + file.hunks > 0 ? " " : ""}${status}`}</Text> : null}
      {file.added + file.removed + file.hunks === 0 && !status ? <Text color={muted ? "gray" : undefined}>no changes</Text> : null}
    </Text>
  );
}

function createDiffFileEntry(path: string): DiffFileEntry {
  return {
    path,
    added: 0,
    removed: 0,
    hunks: 0,
    isBinary: false,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}

function cleanDiffPath(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (trimmed === "/dev/null") return trimmed;
  return trimmed.replace(/^[ab]\//, "");
}
