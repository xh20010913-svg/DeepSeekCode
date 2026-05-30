export interface QuickOpenFile {
  path: string;
  size: number;
  ext: string;
}

export interface QuickOpenItem {
  id: string;
  path: string;
  name: string;
  folder: string;
  ext: string;
  sizeLabel: string;
  match: "all" | "name" | "path" | "extension" | "fuzzy";
}

interface RankedQuickOpenItem extends QuickOpenItem {
  rank: number;
  index: number;
}

export function getQuickOpenItems(
  files: QuickOpenFile[],
  query: string,
  limit = 9,
): QuickOpenItem[] {
  const normalized = normalizeQuickOpenQuery(query);
  const ranked: RankedQuickOpenItem[] = [];
  files.forEach((file, index) => {
    const match = rankFile(file, normalized);
    if (!match) return;
    const name = fileName(file.path);
    ranked.push({
      id: file.path,
      path: file.path,
      name,
      folder: folderName(file.path),
      ext: file.ext,
      sizeLabel: formatFileSize(file.size),
      match: match.match,
      rank: match.rank,
      index,
    });
  });
  ranked.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    if (left.name !== right.name) return left.name.localeCompare(right.name);
    return left.path.localeCompare(right.path);
  });
  return ranked.slice(0, limit).map(({ rank: _rank, index: _index, ...item }) => item);
}

export function quickOpenMentionText(item: QuickOpenItem): string {
  return `@${item.path} `;
}

export function quickOpenPathText(item: QuickOpenItem): string {
  return `${item.path} `;
}

export function normalizeQuickOpenQuery(query: string): string {
  return query.replace(/^@/, "").trim().replaceAll("\\", "/").toLowerCase();
}

function rankFile(
  file: QuickOpenFile,
  query: string,
): { rank: number; match: QuickOpenItem["match"] } | null {
  if (!query) return { rank: 10, match: "all" };
  const path = file.path.toLowerCase();
  const name = fileName(file.path).toLowerCase();
  const ext = file.ext.replace(/^\./, "").toLowerCase();
  if (name === query) return { rank: 0, match: "name" };
  if (name.startsWith(query)) return { rank: 1, match: "name" };
  if (path.startsWith(query)) return { rank: 2, match: "path" };
  if (path.includes(query)) return { rank: 3, match: "path" };
  if (ext === query || file.ext.toLowerCase() === query) return { rank: 4, match: "extension" };
  if (isSubsequence(path, query)) return { rank: 5, match: "fuzzy" };
  return null;
}

function fileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts.at(-1) ?? filePath;
}

function folderName(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.length > 0 ? parts.join("/") : ".";
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isSubsequence(text: string, query: string): boolean {
  let cursor = 0;
  for (let index = 0; index < text.length && cursor < query.length; index += 1) {
    if (text[index] === query[cursor]) cursor += 1;
  }
  return cursor === query.length;
}
