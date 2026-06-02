export interface SkillFrontmatter {
  name?: string;
  description?: string;
  disableModelInvocation?: boolean;
}

export interface ParsedSkillDocument {
  frontmatter: SkillFrontmatter;
  body: string;
}

export interface SkillValidationResult {
  name: string;
  path: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function parseSkillDocument(content: string): ParsedSkillDocument {
  content = stripBom(content);
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: content };
  const frontmatter = parseFrontmatter(content.slice(3, end));
  const body = content.slice(end + "\n---".length).replace(/^\r?\n/, "");
  return { frontmatter, body };
}

export function firstSkillDescription(content: string): string {
  const parsed = parseSkillDocument(content);
  return parsed.frontmatter.description ?? firstUsefulLine(parsed.body);
}

export function validateSkillDocument(
  name: string,
  skillPath: string,
  content: string | null,
): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (content === null) {
    errors.push("missing SKILL.md");
    return { name, path: skillPath, ok: false, errors, warnings };
  }
  const parsed = parseSkillDocument(content);
  if (parsed.frontmatter.name && parsed.frontmatter.name !== name) {
    errors.push(`frontmatter name '${parsed.frontmatter.name}' does not match directory '${name}'`);
  }
  if (!parsed.frontmatter.description && !firstUsefulLine(parsed.body)) {
    warnings.push("missing description or useful first line");
  }
  if (!parsed.body.trim()) {
    errors.push("empty skill instructions");
  }
  return {
    name,
    path: skillPath,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function renderSkillDocument(input: {
  name: string;
  description: string;
  body?: string;
  disableModelInvocation?: boolean;
}): string {
  const lines = [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
  ];
  if (input.disableModelInvocation) lines.push("disable-model-invocation: true");
  lines.push("---", "", input.body?.trim() || defaultSkillBody(input.name, input.description), "");
  return lines.join("\n");
}

export function normalizeSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(content: string): SkillFrontmatter {
  const frontmatter: SkillFrontmatter = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = stripQuotes(match[2]!.trim());
    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
    if (key === "disable-model-invocation") frontmatter.disableModelInvocation = /^true$/i.test(value);
  }
  return frontmatter;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function firstUsefulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line && !line.startsWith("---")) ?? ""
  );
}

function defaultSkillBody(name: string, description: string): string {
  return [
    `Use this skill when the user asks for ${description}.`,
    "",
    "Workflow:",
    "1. Inspect the relevant project files before changing code.",
    "2. Prefer existing DeepSeekCode conventions and local commands.",
    "3. Validate with focused tests or `/status`, `/diff`, `/review`, and `/export` where useful.",
    "",
    `Skill name: ${name}`,
  ].join("\n");
}
