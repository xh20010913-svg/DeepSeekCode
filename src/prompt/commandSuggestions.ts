import type { Command } from "../types/command.js";

export interface SlashCommandSuggestion {
  id: string;
  name: string;
  usage?: string;
  description: string;
  aliases: string[];
}

export interface SlashCommandCompletion {
  value: string;
  cursor: number;
}

export function getSlashCommandSuggestions(
  commands: Command[],
  input: string,
  cursor = input.length,
  limit = 5,
): SlashCommandSuggestion[] {
  const token = commandTokenAt(input, cursor);
  if (!token) return [];
  const query = token.slice(1).toLowerCase();
  const seen = new Set<string>();
  const suggestions: SlashCommandSuggestion[] = [];
  for (const command of commands) {
    if (command.hidden || seen.has(command.name)) continue;
    const aliases = command.aliases ?? [];
    const nameMatches = command.name.toLowerCase().startsWith(query);
    const aliasMatches = aliases.some((alias) => alias.toLowerCase().startsWith(query));
    if (!nameMatches && !aliasMatches) continue;
    seen.add(command.name);
    suggestions.push({
      id: command.name,
      name: command.name,
      usage: command.usage,
      description: command.description,
      aliases,
    });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

export function completeSlashCommand(
  input: string,
  cursor: number,
  suggestion: SlashCommandSuggestion,
): SlashCommandCompletion {
  const token = commandTokenAt(input, cursor);
  if (!token) return { value: input, cursor };
  const end = token.length;
  const suffix = input.slice(end);
  const commandText = `/${suggestion.name}`;
  const addSpace = suffix.length === 0 || !suffix.startsWith(" ");
  const value = `${commandText}${addSpace ? " " : ""}${suffix}`;
  const cursorAfterCommand = commandText.length + (addSpace || suffix.startsWith(" ") ? 1 : 0);
  return {
    value,
    cursor: cursorAfterCommand,
  };
}

export function commandTokenAt(input: string, cursor = input.length): string | null {
  if (!input.startsWith("/")) return null;
  const safeCursor = Math.max(0, Math.min(input.length, cursor));
  const firstWhitespace = input.search(/\s/);
  const tokenEnd = firstWhitespace === -1 ? input.length : firstWhitespace;
  if (safeCursor > tokenEnd) return null;
  return input.slice(0, tokenEnd);
}
