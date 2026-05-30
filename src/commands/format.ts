import type { Command } from "../types/command.js";
import { getCommandName } from "../types/command.js";

export function formatCommandHelp(commands: Command[]): string {
  return commands
    .filter((command) => !command.hidden)
    .map((command) => {
      const usage = command.usage ? ` ${command.usage}` : "";
      return `${getCommandName(command)}${usage} - ${command.description}`;
    })
    .join("\n");
}

export function parseLimit(value: string, fallback: number, max = 100): number {
  const parsed = Number(value.trim() || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function compactPath(value: string, max: number): string {
  if (value.length <= max) return value;
  return `...${value.slice(-(max - 3))}`;
}

export function firstLine(value: string, max = 120): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}
