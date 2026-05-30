import type { Command } from "../types/command.js";

export interface CommandPaletteItem {
  id: string;
  name: string;
  description: string;
  usage?: string;
  aliases: string[];
  match: "name" | "alias" | "description" | "fuzzy" | "all";
}

interface RankedCommandPaletteItem extends CommandPaletteItem {
  rank: number;
  index: number;
}

export function getCommandPaletteItems(
  commands: Command[],
  query: string,
  limit = 9,
): CommandPaletteItem[] {
  const normalized = normalizePaletteQuery(query);
  const ranked: RankedCommandPaletteItem[] = [];
  const seen = new Set<string>();
  commands.forEach((command, index) => {
    if (command.hidden || seen.has(command.name)) return;
    const match = rankCommand(command, normalized);
    if (!match) return;
    seen.add(command.name);
    ranked.push({
      id: command.name,
      name: command.name,
      usage: command.usage,
      description: command.description,
      aliases: command.aliases ?? [],
      match: match.match,
      rank: match.rank,
      index,
    });
  });
  ranked.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    if (left.rank === 10) return left.index - right.index;
    return left.name.localeCompare(right.name);
  });
  return ranked.slice(0, limit).map(({ rank: _rank, index: _index, ...item }) => item);
}

export function commandPaletteInsertText(item: CommandPaletteItem): string {
  return `/${item.name} `;
}

export function normalizePaletteQuery(query: string): string {
  return query.replace(/^\//, "").trim().toLowerCase();
}

function rankCommand(
  command: Command,
  query: string,
): { rank: number; match: CommandPaletteItem["match"] } | null {
  if (!query) return { rank: 10, match: "all" };
  const name = command.name.toLowerCase();
  const aliases = (command.aliases ?? []).map((alias) => alias.toLowerCase());
  const description = command.description.toLowerCase();
  if (name === query) return { rank: 0, match: "name" };
  if (name.startsWith(query)) return { rank: 1, match: "name" };
  if (aliases.some((alias) => alias === query || alias.startsWith(query))) {
    return { rank: 2, match: "alias" };
  }
  if (name.includes(query)) return { rank: 3, match: "name" };
  if (description.includes(query)) return { rank: 4, match: "description" };
  if (isSubsequence(name, query) || aliases.some((alias) => isSubsequence(alias, query))) {
    return { rank: 5, match: "fuzzy" };
  }
  return null;
}

function isSubsequence(text: string, query: string): boolean {
  let cursor = 0;
  for (let index = 0; index < text.length && cursor < query.length; index += 1) {
    if (text[index] === query[cursor]) cursor += 1;
  }
  return cursor === query.length;
}
