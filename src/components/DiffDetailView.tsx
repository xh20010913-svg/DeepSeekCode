import React from "react";
import { Box, Text } from "ink";
import { truncateCells } from "./design/textLayout.js";

export type DiffDetailLineKind = "add" | "remove" | "context" | "meta";

export interface DiffDetailLine {
  kind: DiffDetailLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffDetailHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffDetailLine[];
}

export interface DiffDetailFile {
  path: string;
  oldPath?: string;
  status: "modified" | "new" | "deleted" | "renamed" | "binary";
  added: number;
  removed: number;
  hunks: DiffDetailHunk[];
}

const DEFAULT_MAX_LINES = 220;
const DEFAULT_WIDTH = 112;

export function DiffDetailView(props: {
  diff: string;
  selectedFileIndex?: number;
  maxLines?: number;
  width?: number;
}): React.ReactElement {
  const files = selectDiffDetailFiles(parseDiffDetailFiles(props.diff), props.selectedFileIndex);
  const maxLines = props.maxLines ?? DEFAULT_MAX_LINES;
  const width = props.width ?? DEFAULT_WIDTH;

  if (files.length === 0) {
    return <RawDiffFallback diff={props.diff} maxLines={maxLines} width={width} />;
  }

  const model = clipDiffDetailFiles(files, maxLines);

  return (
    <Box flexDirection="column">
      {model.files.map((file, index) => (
        <DiffDetailFileBlock key={`${index}:${file.path}`} file={file} width={width} />
      ))}
      {model.clippedLines > 0 ? <Text color="gray">{`... ${model.clippedLines} more diff lines ...`}</Text> : null}
    </Box>
  );
}

export function parseDiffDetailFiles(diff: string): DiffDetailFile[] {
  const files: DiffDetailFile[] = [];
  let current: DiffDetailFile | undefined;
  let currentHunk: DiffDetailHunk | undefined;
  let oldCursor = 0;
  let newCursor = 0;
  let pendingOldPath = "";

  const finishFile = () => {
    if (!current) return;
    if (current.path || current.oldPath || current.hunks.length > 0 || current.status === "binary") {
      if (!current.path) current.path = current.oldPath || "unknown";
      files.push(current);
    }
    current = undefined;
    currentHunk = undefined;
    oldCursor = 0;
    newCursor = 0;
    pendingOldPath = "";
  };

  const ensureFile = (path = ""): DiffDetailFile => {
    if (!current) current = createDiffDetailFile(path || pendingOldPath || "unknown");
    if (path && path !== "/dev/null") current.path = path;
    return current;
  };

  for (const line of diff.split(/\r?\n/)) {
    const gitMatch = line.match(/^diff --git\s+(.+?)\s+(.+)$/);
    if (gitMatch) {
      finishFile();
      const oldPath = cleanDiffPath(gitMatch[1] ?? "");
      const newPath = cleanDiffPath(gitMatch[2] ?? "");
      pendingOldPath = oldPath === "/dev/null" ? "" : oldPath;
      current = createDiffDetailFile(newPath && newPath !== "/dev/null" ? newPath : pendingOldPath);
      current.oldPath = pendingOldPath || undefined;
      continue;
    }

    if (line.startsWith("new file mode")) {
      ensureFile().status = "new";
      continue;
    }

    if (line.startsWith("deleted file mode")) {
      ensureFile().status = "deleted";
      continue;
    }

    if (line.startsWith("Binary files ")) {
      ensureFile(pendingOldPath).status = "binary";
      continue;
    }

    const renameFromMatch = line.match(/^rename from\s+(.+)$/);
    if (renameFromMatch) {
      const file = ensureFile(cleanDiffPath(renameFromMatch[1] ?? ""));
      file.oldPath = file.path;
      file.status = "renamed";
      pendingOldPath = file.path;
      continue;
    }

    const renameToMatch = line.match(/^rename to\s+(.+)$/);
    if (renameToMatch) {
      const file = ensureFile(cleanDiffPath(renameToMatch[1] ?? ""));
      file.status = "renamed";
      continue;
    }

    const oldFileMatch = line.match(/^---\s+(.+)$/);
    if (oldFileMatch) {
      const path = cleanDiffPath(oldFileMatch[1] ?? "");
      if (path === "/dev/null") {
        ensureFile().status = "new";
      } else {
        pendingOldPath = path;
        const file = ensureFile(path);
        file.oldPath = path;
      }
      continue;
    }

    const newFileMatch = line.match(/^\+\+\+\s+(.+)$/);
    if (newFileMatch) {
      const path = cleanDiffPath(newFileMatch[1] ?? "");
      if (path === "/dev/null") {
        ensureFile(pendingOldPath).status = "deleted";
      } else {
        ensureFile(path);
      }
      continue;
    }

    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
    if (hunkMatch) {
      const file = ensureFile(pendingOldPath);
      oldCursor = Number(hunkMatch[1]);
      newCursor = Number(hunkMatch[2]);
      currentHunk = {
        header: line,
        oldStart: oldCursor,
        newStart: newCursor,
        lines: [],
      };
      file.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("\\ No newline")) {
      currentHunk.lines.push({ kind: "meta", text: line });
      continue;
    }

    if (line.startsWith("+")) {
      const file = ensureFile();
      file.added += 1;
      currentHunk.lines.push({ kind: "add", text: line.slice(1), newLine: newCursor });
      newCursor += 1;
      continue;
    }

    if (line.startsWith("-")) {
      const file = ensureFile();
      file.removed += 1;
      currentHunk.lines.push({ kind: "remove", text: line.slice(1), oldLine: oldCursor });
      oldCursor += 1;
      continue;
    }

    const text = line.startsWith(" ") ? line.slice(1) : line;
    currentHunk.lines.push({ kind: "context", text, oldLine: oldCursor, newLine: newCursor });
    oldCursor += 1;
    newCursor += 1;
  }

  finishFile();
  return files;
}

export function clipDiffDetailFiles(
  files: DiffDetailFile[],
  maxLines = DEFAULT_MAX_LINES,
): { files: DiffDetailFile[]; clippedLines: number } {
  let remaining = Math.max(0, maxLines);
  let clippedLines = 0;
  const clippedFiles: DiffDetailFile[] = [];

  for (const file of files) {
    if (remaining <= 0) {
      clippedLines += countFileDetailLines(file);
      continue;
    }

    const nextFile: DiffDetailFile = { ...file, hunks: [] };
    for (const hunk of file.hunks) {
      if (remaining <= 0) {
        clippedLines += countHunkLines(hunk);
        continue;
      }

      const lineBudget = Math.max(0, remaining - 1);
      const visibleLines = hunk.lines.slice(0, lineBudget);
      nextFile.hunks.push({ ...hunk, lines: visibleLines });
      remaining -= 1 + visibleLines.length;
      clippedLines += Math.max(0, hunk.lines.length - visibleLines.length);
    }

    clippedFiles.push(nextFile);
  }

  return { files: clippedFiles, clippedLines };
}

export function selectDiffDetailFiles(
  files: DiffDetailFile[],
  selectedFileIndex?: number,
): DiffDetailFile[] {
  if (selectedFileIndex === undefined) return files;
  if (files.length === 0) return [];
  return [files[clampIndex(selectedFileIndex, files.length)]!];
}

export function diffDetailStatusLabel(file: DiffDetailFile): string {
  const parts = [`+${file.added}`, `-${file.removed}`, `${file.hunks.length} hunk${file.hunks.length === 1 ? "" : "s"}`];
  if (file.status !== "modified") parts.push(file.status);
  return parts.join(" | ");
}

function DiffDetailFileBlock(props: {
  file: DiffDetailFile;
  width: number;
}): React.ReactElement {
  const titleWidth = Math.max(24, props.width - 32);
  const title = truncateCells(props.file.path, titleWidth);
  const renamedFrom = props.file.status === "renamed" && props.file.oldPath && props.file.oldPath !== props.file.path
    ? ` from ${truncateCells(props.file.oldPath, Math.max(8, titleWidth - props.file.path.length - 6))}`
    : "";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="cyan" bold>
          {title}
        </Text>
        {renamedFrom ? <Text color="gray">{renamedFrom}</Text> : null}
        <Text color="gray">{`  ${diffDetailStatusLabel(props.file)}`}</Text>
      </Text>
      {props.file.status === "binary" ? (
        <Text color="gray" italic>
          binary file - diff content is not displayable
        </Text>
      ) : props.file.hunks.length === 0 ? (
        <Text color="gray">No diff content</Text>
      ) : (
        props.file.hunks.map((hunk, index) => <DiffDetailHunkBlock key={`${index}:${hunk.header}`} hunk={hunk} width={props.width} />)
      )}
    </Box>
  );
}

function DiffDetailHunkBlock(props: {
  hunk: DiffDetailHunk;
  width: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{truncateCells(props.hunk.header, props.width)}</Text>
      {props.hunk.lines.map((line, index) => (
        <DiffDetailLineRow key={`${index}:${line.kind}:${line.text.slice(0, 16)}`} line={line} width={props.width} />
      ))}
    </Box>
  );
}

function DiffDetailLineRow(props: {
  line: DiffDetailLine;
  width: number;
}): React.ReactElement {
  const oldLabel = formatLineNumber(props.line.oldLine);
  const newLabel = formatLineNumber(props.line.newLine);
  const prefix = linePrefix(props.line.kind);
  const bodyWidth = Math.max(12, props.width - 12);

  return (
    <Text>
      <Text color="gray">{`${oldLabel} ${newLabel} `}</Text>
      <Text color={detailLineColor(props.line.kind)}>
        {prefix}
        {truncateCells(props.line.text || " ", bodyWidth)}
      </Text>
    </Text>
  );
}

function RawDiffFallback(props: {
  diff: string;
  maxLines: number;
  width: number;
}): React.ReactElement {
  const lines = props.diff.split(/\r?\n/);
  const visible = lines.slice(0, props.maxLines);
  const clipped = Math.max(0, lines.length - visible.length);

  return (
    <Box flexDirection="column">
      {visible.map((line, index) => (
        <Text key={`${index}:${line.slice(0, 24)}`} color={rawDiffLineColor(line)}>
          {truncateCells(line || " ", props.width)}
        </Text>
      ))}
      {clipped > 0 ? <Text color="gray">{`... ${clipped} more diff lines ...`}</Text> : null}
    </Box>
  );
}

function countFileDetailLines(file: DiffDetailFile): number {
  return file.hunks.reduce((total, hunk) => total + countHunkLines(hunk), 0);
}

function countHunkLines(hunk: DiffDetailHunk): number {
  return 1 + hunk.lines.length;
}

function createDiffDetailFile(path: string): DiffDetailFile {
  return {
    path,
    status: "modified",
    added: 0,
    removed: 0,
    hunks: [],
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}

function formatLineNumber(value: number | undefined): string {
  return value === undefined ? "    " : String(value).padStart(4, " ");
}

function linePrefix(kind: DiffDetailLineKind): string {
  if (kind === "add") return "+";
  if (kind === "remove") return "-";
  if (kind === "meta") return "\\";
  return " ";
}

function detailLineColor(kind: DiffDetailLineKind): string | undefined {
  if (kind === "add") return "green";
  if (kind === "remove") return "red";
  if (kind === "meta") return "gray";
  return undefined;
}

function rawDiffLineColor(line: string): string | undefined {
  if (line.startsWith("@@")) return "cyan";
  if (line.startsWith("+++") || line.startsWith("---")) return "gray";
  if (line.startsWith("+")) return "green";
  if (line.startsWith("-")) return "red";
  return undefined;
}

function cleanDiffPath(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (trimmed === "/dev/null") return trimmed;
  return trimmed.replace(/^[ab]\//, "");
}
