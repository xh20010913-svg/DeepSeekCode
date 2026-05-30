import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./design/StatusBadge.js";
import { truncateCells } from "./design/textLayout.js";

export function MemoryUpdateNotification(props: {
  memoryPath: string;
  projectPath?: string;
  width?: number;
}): React.ReactElement {
  const width = props.width ?? 80;
  const displayPath = relativeMemoryPath(props.memoryPath, props.projectPath);
  return (
    <Box flexDirection="row">
      <StatusBadge label="memory" tone="success" />
      <Text color="gray"> </Text>
      <Text color="gray">
        {truncateCells(`updated ${displayPath}; use /memory to review or /memory add <text> to append`, Math.max(24, width - 12))}
      </Text>
    </Box>
  );
}

export function relativeMemoryPath(
  memoryPath: string,
  cwd = process.cwd(),
  home = homedir(),
): string {
  const absolutePath = resolve(memoryPath);
  const candidates = [
    pathInsideLabel(absolutePath, resolve(cwd), "."),
    pathInsideLabel(absolutePath, resolve(home), "~"),
  ].filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return memoryPath;
  return candidates.sort((left, right) => left.length - right.length)[0] ?? memoryPath;
}

function pathInsideLabel(absolutePath: string, basePath: string, label: string): string | null {
  if (!isInsideOrSame(absolutePath, basePath)) return null;
  const rel = relative(basePath, absolutePath);
  if (!rel) return label;
  const normalized = rel.replace(/\\/g, "/");
  return label === "." ? `./${normalized}` : `${label}/${normalized}`;
}

function isInsideOrSame(absolutePath: string, basePath: string): boolean {
  const rel = relative(basePath, absolutePath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
