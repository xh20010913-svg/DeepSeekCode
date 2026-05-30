import fs from "node:fs";
import path from "node:path";
import { buildRepositoryMap } from "../../context/repositoryMap.js";
import { redactSecrets } from "../../context/contextBundle.js";
import { safeJoin } from "../../tools/pathSafety.js";
import { normalizeCachePinName, CachePinService } from "./cachePins.js";

export interface CachePinSuggestion {
  name: string;
  sourcePath: string;
  score: number;
  reason: string;
  chars: number;
  preview: string;
  command: string;
  alreadyPinned: boolean;
}

export interface CachePinFromSourceResult {
  name: string;
  path: string;
  sourcePath: string;
  chars: number;
  alreadyPinned: boolean;
}

export interface CachePinApplyResult {
  goal: string;
  limit: number;
  created: CachePinFromSourceResult[];
  skipped: CachePinSuggestion[];
  errors: Array<{
    name: string;
    sourcePath: string;
    message: string;
  }>;
}

const STABLE_EXTENSIONS = new Set([".md", ".json", ".toml", ".yml", ".yaml"]);
const MAX_SOURCE_BYTES = 80_000;
const MAX_PREVIEW_CHARS = 1_200;
const MAX_COMMAND_CHARS = 260;

export function suggestCachePins(
  projectPath: string,
  options: { goal?: string; limit?: number } = {},
): CachePinSuggestion[] {
  const root = path.resolve(projectPath);
  const goalTokens = tokenize(options.goal ?? "");
  const existingPins = new CachePinService(root).list();
  return buildRepositoryMap(root, 700).files
    .filter((file) => STABLE_EXTENSIONS.has(file.ext))
    .filter((file) => file.size > 0 && file.size <= MAX_SOURCE_BYTES)
    .filter((file) => !isLockOrGenerated(file.path))
    .map((file) => {
      const fullPath = path.join(root, file.path);
      const raw = safeReadText(fullPath);
      const preview = buildPreview(file.path, raw);
      const score = scoreCandidate(file.path, file.ext, preview, goalTokens);
      const name = pinNameFor(file.path);
      return {
        name,
        sourcePath: file.path,
        score,
        reason: reasonFor(file.path, goalTokens, score),
        chars: preview.length,
        preview,
        command: buildPinCommand(name, preview),
        alreadyPinned: existingPins.some((pin) => pin.name === name || pin.content.includes(`Source: ${file.path}`)),
      };
    })
    .filter((suggestion) => suggestion.score > 0 && suggestion.preview.trim().length > 0)
    .sort((a, b) => Number(a.alreadyPinned) - Number(b.alreadyPinned) || b.score - a.score || a.sourcePath.localeCompare(b.sourcePath))
    .slice(0, Math.max(1, Math.min(20, options.limit ?? 5)));
}

export function formatCachePinSuggestions(suggestions: CachePinSuggestion[]): string {
  if (suggestions.length === 0) {
    return "No stable cache pin candidates found. Add one manually with /cache pin add <name> <content>.";
  }
  return suggestions.map((suggestion, index) => [
    `${index + 1}. ${suggestion.name} score=${suggestion.score}${suggestion.alreadyPinned ? " already-pinned" : ""}`,
    `   source=${suggestion.sourcePath} chars=${suggestion.chars}`,
    `   reason=${suggestion.reason}`,
    `   preview=${oneLine(suggestion.preview, 180)}`,
    `   command=${suggestion.command}`,
  ].join("\n")).join("\n");
}

export function applyCachePinSuggestions(
  projectPath: string,
  options: { goal?: string; limit?: number } = {},
): CachePinApplyResult {
  const limit = Math.max(1, Math.min(10, options.limit ?? 4));
  const suggestions = suggestCachePins(projectPath, {
    goal: options.goal,
    limit: Math.max(limit + 6, limit),
  });
  const result: CachePinApplyResult = {
    goal: options.goal?.trim() ?? "",
    limit,
    created: [],
    skipped: [],
    errors: [],
  };

  for (const suggestion of suggestions) {
    if (result.created.length >= limit) break;
    if (suggestion.alreadyPinned) {
      result.skipped.push(suggestion);
      continue;
    }
    try {
      result.created.push(createCachePinFromSource(projectPath, suggestion.sourcePath, suggestion.name));
    } catch (error) {
      result.errors.push({
        name: suggestion.name,
        sourcePath: suggestion.sourcePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export function formatCachePinApplyResult(result: CachePinApplyResult): string {
  const lines = [
    `cache pin apply: created=${result.created.length} skipped=${result.skipped.length} errors=${result.errors.length} limit=${result.limit}`,
  ];
  if (result.goal) lines.push(`goal=${result.goal}`);
  for (const pin of result.created) {
    lines.push(`+ ${pin.name} source=${pin.sourcePath} chars=${pin.chars}`);
  }
  for (const pin of result.skipped.slice(0, 5)) {
    lines.push(`= ${pin.name} source=${pin.sourcePath} already-pinned`);
  }
  for (const error of result.errors.slice(0, 5)) {
    lines.push(`! ${error.name} source=${error.sourcePath} ${error.message}`);
  }
  if (result.created.length === 0 && result.errors.length === 0) {
    lines.push("No new stable cache pins were created. Run /cache pin suggest [goal] to inspect candidates.");
  } else {
    lines.push("Next: run /cache pin audit, then /cache plan <goal> before a large DeepSeek run.");
  }
  return lines.join("\n");
}

export function createCachePinFromSource(
  projectPath: string,
  sourcePath: string,
  requestedName?: string,
): CachePinFromSourceResult {
  const root = path.resolve(projectPath);
  const normalizedSource = normalizeSourcePath(root, sourcePath);
  const ext = path.extname(normalizedSource).toLowerCase();
  if (!STABLE_EXTENSIONS.has(ext)) {
    throw new Error(`cache pin source must be a stable text file (${Array.from(STABLE_EXTENSIONS).join(", ")}): ${normalizedSource}`);
  }
  if (isLockOrGenerated(normalizedSource)) {
    throw new Error(`cache pin source looks generated or lock-like: ${normalizedSource}`);
  }
  const fullPath = safeJoin(root, normalizedSource);
  if (!fs.existsSync(fullPath)) throw new Error(`cache pin source not found: ${normalizedSource}`);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) throw new Error(`cache pin source is not a file: ${normalizedSource}`);
  if (stat.size <= 0) throw new Error(`cache pin source is empty: ${normalizedSource}`);
  if (stat.size > MAX_SOURCE_BYTES) throw new Error(`cache pin source is too large: ${normalizedSource}`);
  const raw = fs.readFileSync(fullPath, "utf8");
  const content = buildPreview(normalizedSource, raw);
  const service = new CachePinService(root);
  const name = requestedName ? normalizeCachePinName(requestedName) : pinNameFor(normalizedSource);
  if (!name) throw new Error("cache pin name must use letters, numbers, dot, underscore, or dash");
  const alreadyPinned = Boolean(service.load(name));
  const pin = service.create(name, content);
  return {
    name: pin.name,
    path: pin.path,
    sourcePath: normalizedSource,
    chars: pin.chars,
    alreadyPinned,
  };
}

function scoreCandidate(filePath: string, ext: string, preview: string, goalTokens: string[]): number {
  const lower = filePath.toLowerCase();
  let score = 0;
  if (lower === "package.json") score += 95;
  if (lower === "tsconfig.json") score += 75;
  if (lower === "readme.md" || lower.endsWith("/readme.md")) score += 90;
  if (lower.startsWith("docs/") || lower.includes("/docs/")) score += 70;
  if (lower.includes("architecture") || lower.includes("design") || lower.includes("parity")) score += 35;
  if (lower.includes("research") || lower.includes("roadmap")) score += 20;
  if (ext === ".md") score += 15;
  if (ext === ".json") score += 10;
  const previewLower = preview.toLowerCase();
  for (const token of goalTokens) {
    if (lower.includes(token)) score += 18;
    if (previewLower.includes(token)) score += 10;
  }
  if (preview.length < 80) score -= 25;
  return score;
}

function reasonFor(filePath: string, goalTokens: string[], score: number): string {
  const lower = filePath.toLowerCase();
  const reasons = [];
  if (lower === "package.json") reasons.push("project identity and scripts are stable");
  if (lower === "tsconfig.json") reasons.push("TypeScript runtime settings are stable");
  if (lower === "readme.md" || lower.endsWith("/readme.md")) reasons.push("README usually captures durable project intent");
  if (lower.startsWith("docs/") || lower.includes("/docs/")) reasons.push("docs often contain reusable architecture facts");
  const matched = goalTokens.filter((token) => lower.includes(token));
  if (matched.length) reasons.push(`matches goal token ${matched.slice(0, 3).join(",")}`);
  if (reasons.length === 0) reasons.push(score >= 80 ? "high stable-context score" : "candidate stable project fact");
  return reasons.join("; ");
}

function buildPreview(filePath: string, raw: string): string {
  const content = redactSecrets(raw).split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  const selected = content.slice(0, 24).join("\n");
  return [`Source: ${filePath}`, selected].join("\n").slice(0, MAX_PREVIEW_CHARS).trim();
}

function buildPinCommand(name: string, preview: string): string {
  return `/cache pin add ${name} ${oneLine(preview, MAX_COMMAND_CHARS)}`;
}

function pinNameFor(filePath: string): string {
  const parsed = path.parse(filePath.replace(/\\/g, "/"));
  const directory = parsed.dir.split("/").filter(Boolean).slice(-1)[0];
  const base = [directory, parsed.name].filter(Boolean).join("-");
  return normalizeCachePinName(base) ?? "project-facts";
}

function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function normalizeSourcePath(root: string, sourcePath: string): string {
  const target = safeJoin(root, sourcePath);
  return path.relative(root, target).replaceAll("\\", "/");
}

function isLockOrGenerated(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith("package-lock.json")
    || lower.endsWith("pnpm-lock.yaml")
    || lower.endsWith("yarn.lock")
    || lower.includes(".generated.")
    || lower.includes("/generated/");
}

function tokenize(value: string): string[] {
  return Array.from(new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_\-\u4e00-\u9fa5]+/u)
      .filter((token) => token.length >= 2)
      .slice(0, 20),
  ));
}

function oneLine(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}
