export interface AgentFrontmatter {
  name?: string;
  description?: string;
  whenToUse?: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  color?: string;
  background?: boolean;
  maxTurns?: number;
}

export interface ParsedAgentDocument {
  frontmatter: AgentFrontmatter;
  body: string;
}

export interface AgentValidationResult {
  name: string;
  path: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function parseAgentDocument(content: string): ParsedAgentDocument {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: content };
  const frontmatter = parseFrontmatter(content.slice(3, end));
  const body = content.slice(end + "\n---".length).replace(/^\r?\n/, "");
  return { frontmatter, body };
}

export function normalizeAgentName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function renderAgentDocument(input: {
  name: string;
  description: string;
  body?: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
  color?: string;
  maxTurns?: number;
}): string {
  const name = normalizeAgentName(input.name);
  const lines = [
    "---",
    `name: ${name}`,
    `description: ${input.description.trim()}`,
    `model: ${input.model?.trim() || "inherit"}`,
  ];
  if (input.tools?.length) lines.push(`tools: ${input.tools.join(", ")}`);
  if (input.disallowedTools?.length) lines.push(`disallowed-tools: ${input.disallowedTools.join(", ")}`);
  if (input.color) lines.push(`color: ${input.color}`);
  if (input.maxTurns) lines.push(`max-turns: ${input.maxTurns}`);
  lines.push("---", "", input.body?.trim() || defaultAgentBody(name, input.description), "");
  return lines.join("\n");
}

export function validateAgentDocument(
  name: string,
  agentPath: string,
  content: string | null,
  knownTools: string[] = [],
): AgentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (content === null) {
    errors.push("missing agent markdown file");
    return { name, path: agentPath, ok: false, errors, warnings };
  }
  const parsed = parseAgentDocument(content);
  const acceptableNames = new Set([name, name.split(":").at(-1) ?? name]);
  if (parsed.frontmatter.name && !acceptableNames.has(normalizeAgentName(parsed.frontmatter.name))) {
    errors.push(`frontmatter name '${parsed.frontmatter.name}' does not match file '${name}'`);
  }
  if (!parsed.frontmatter.description && !parsed.frontmatter.whenToUse && !firstUsefulLine(parsed.body)) {
    warnings.push("missing description, when-to-use, or useful first line");
  }
  if (!parsed.body.trim()) {
    errors.push("empty agent system prompt");
  }
  if (parsed.frontmatter.maxTurns !== undefined && parsed.frontmatter.maxTurns < 1) {
    errors.push("max-turns must be positive");
  }
  const known = new Set(knownTools);
  for (const tool of parsed.frontmatter.tools ?? []) {
    if (known.size > 0 && !known.has(tool)) warnings.push(`unknown tool '${tool}'`);
  }
  for (const skill of parsed.frontmatter.skills ?? []) {
    if (normalizeAgentName(skill) !== skill) warnings.push(`skill '${skill}' is not normalized`);
  }
  return { name, path: agentPath, ok: errors.length === 0, errors, warnings };
}

function parseFrontmatter(content: string): AgentFrontmatter {
  const frontmatter: AgentFrontmatter = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = stripQuotes(match[2]!.trim());
    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
    if (key === "when-to-use") frontmatter.whenToUse = value;
    if (key === "model") frontmatter.model = value;
    if (key === "tools") frontmatter.tools = splitList(value).map(normalizeAgentName).filter(Boolean);
    if (key === "disallowed-tools") frontmatter.disallowedTools = splitList(value).map(normalizeAgentName).filter(Boolean);
    if (key === "skills") frontmatter.skills = splitList(value).map(normalizeAgentName).filter(Boolean);
    if (key === "color") frontmatter.color = value;
    if (key === "background") frontmatter.background = /^true$/i.test(value);
    if (key === "max-turns" || key === "maxturns") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) frontmatter.maxTurns = parsed;
    }
  }
  return frontmatter;
}

function splitList(value: string): string[] {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((entry) => stripQuotes(entry.trim()))
    .filter(Boolean);
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function firstUsefulLine(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line && !line.startsWith("---")) ?? ""
  );
}

function defaultAgentBody(name: string, description: string): string {
  return [
    `You are the ${name} agent for DeepSeekCode.`,
    "",
    `Mission: ${description.trim()}`,
    "",
    "Work style:",
    "1. Keep the stable system prompt small and reusable for DeepSeek cache hits.",
    "2. Use only the tools listed in frontmatter when tools are specified.",
    "3. Return concise evidence and next actions for the parent agent.",
  ].join("\n");
}
