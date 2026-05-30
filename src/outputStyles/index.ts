export const deepseekTheme = {
  brand: "cyan",
  dim: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
  panelBorder: "gray",
} as const;

export interface OutputStyle {
  name: string;
  scope: "builtin" | "project" | "user" | "cache" | "plugin";
  description: string;
  prompt: string;
  path?: string;
}

export const BUILTIN_OUTPUT_STYLES: OutputStyle[] = [
  {
    name: "deepseek",
    scope: "builtin",
    description: "Chinese-first engineering assistant with concise validation notes.",
    prompt: [
      "Answer primarily in Chinese unless the user asks otherwise.",
      "Keep implementation updates concise and mention verification results.",
      "Preserve DeepSeek token/cache efficiency: avoid restating large code when paths and summaries are enough.",
    ].join("\n"),
  },
  {
    name: "concise",
    scope: "builtin",
    description: "Short, direct answers with only essential context.",
    prompt: [
      "Use short answers.",
      "Lead with the result, then include only necessary commands, files, or risks.",
    ].join("\n"),
  },
  {
    name: "reviewer",
    scope: "builtin",
    description: "Code-review stance: findings first, then risks and tests.",
    prompt: [
      "When reviewing code, lead with concrete findings ordered by severity.",
      "Use file and line references when available.",
      "Keep summaries secondary to bugs, regressions, risks, and missing tests.",
    ].join("\n"),
  },
  {
    name: "architect",
    scope: "builtin",
    description: "Architecture-focused answers with tradeoffs and migration steps.",
    prompt: [
      "Explain architecture decisions through constraints, tradeoffs, and staged migration steps.",
      "Prefer small durable interfaces and project-local conventions.",
    ].join("\n"),
  },
];

export function normalizeOutputStyleName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseOutputStyleDocument(content: string): {
  description?: string;
  prompt: string;
} {
  if (!content.startsWith("---")) return { prompt: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { prompt: content };
  const metadata = parseFrontmatter(content.slice(3, end));
  const prompt = content.slice(end + "\n---".length).replace(/^\r?\n/, "");
  return { description: metadata.description, prompt };
}

export function renderOutputStyleDocument(input: {
  name: string;
  description: string;
  prompt?: string;
}): string {
  const name = normalizeOutputStyleName(input.name);
  return [
    "---",
    `name: ${name}`,
    `description: ${input.description.trim()}`,
    "---",
    "",
    input.prompt?.trim() || [
      `Use this output style for ${input.description.trim()}.`,
      "Keep DeepSeekCode responses accurate, compact, and easy to verify.",
    ].join("\n"),
    "",
  ].join("\n");
}

function parseFrontmatter(content: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    entries[match[1]!.toLowerCase()] = stripQuotes(match[2]!.trim());
  }
  return entries;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}
