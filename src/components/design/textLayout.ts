import { cellWidth } from "../../prompt/promptViewport.js";

export function flattenCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function padRightCells(value: string, width: number): string {
  const truncated = truncateCells(value, width);
  return `${truncated}${" ".repeat(Math.max(0, width - cellWidth(truncated)))}`;
}

export function truncateCells(value: string, width: number): string {
  const max = Math.max(0, width);
  if (cellWidth(value) <= max) return value;
  if (max <= 3) return takeCells(value, max);
  return `${takeCells(value, max - 3)}...`;
}

export function truncateStartCells(value: string, width: number): string {
  const max = Math.max(0, width);
  if (cellWidth(value) <= max) return value;
  if (max <= 3) return takeEndCells(value, max);
  return `...${takeEndCells(value, max - 3)}`;
}

export function takeCells(value: string, width: number): string {
  let used = 0;
  let output = "";
  for (const char of value) {
    const next = cellWidth(char);
    if (used + next > width) break;
    output += char;
    used += next;
  }
  return output;
}

export function takeEndCells(value: string, width: number): string {
  let used = 0;
  let output = "";
  const chars = Array.from(value);
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index] ?? "";
    const next = cellWidth(char);
    if (used + next > width) break;
    output = `${char}${output}`;
    used += next;
  }
  return output;
}
