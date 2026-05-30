export interface HistorySearchItem {
  id: string;
  text: string;
  firstLine: string;
  lineCount: number;
  match: "all" | "exact" | "fuzzy";
  ageLabel: string;
}

interface RankedHistorySearchItem extends HistorySearchItem {
  rank: number;
  index: number;
}

export function getHistorySearchItems(
  entries: string[],
  query: string,
  limit = 9,
): HistorySearchItem[] {
  const normalized = query.trim().toLowerCase();
  const ranked: RankedHistorySearchItem[] = [];
  entries.forEach((entry, index) => {
    const text = entry.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const match = rankHistoryEntry(lower, normalized);
    if (!match) return;
    ranked.push({
      id: `${index}:${text.slice(0, 24)}`,
      text,
      firstLine: firstLine(text),
      lineCount: text.split(/\r?\n/).length,
      ageLabel: relativePositionLabel(index),
      match: match.match,
      rank: match.rank,
      index,
    });
  });
  ranked.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.index - right.index;
  });
  return ranked.slice(0, limit).map(({ rank: _rank, index: _index, ...item }) => item);
}

export function historySearchInsertText(item: HistorySearchItem): string {
  return item.text;
}

function rankHistoryEntry(
  lowerText: string,
  query: string,
): { rank: number; match: HistorySearchItem["match"] } | null {
  if (!query) return { rank: 10, match: "all" };
  if (lowerText.includes(query)) return { rank: 0, match: "exact" };
  if (isSubsequence(lowerText, query)) return { rank: 1, match: "fuzzy" };
  return null;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0]?.trim() || "(empty prompt)";
}

function relativePositionLabel(index: number): string {
  if (index === 0) return "latest";
  return `-${index}`;
}

function isSubsequence(text: string, query: string): boolean {
  let cursor = 0;
  for (let index = 0; index < text.length && cursor < query.length; index += 1) {
    if (text[index] === query[cursor]) cursor += 1;
  }
  return cursor === query.length;
}
