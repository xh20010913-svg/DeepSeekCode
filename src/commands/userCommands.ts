import fs from "node:fs";
import path from "node:path";
import type { Command } from "../types/command.js";

type CustomCommandScope = "project" | "user" | "cache";

interface CustomCommandDocument {
  name: string;
  scope: CustomCommandScope;
  path: string;
  description: string;
  usage?: string;
  aliases: string[];
  prompt: string;
}

export function discoverUserCommands(projectPath: string, dataDir: string): Command[] {
  return discoverCustomCommandDocuments(projectPath, dataDir)
    .map(toSlashCommand)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverCustomCommandDocuments(
  projectPath: string,
  dataDir: string,
): CustomCommandDocument[] {
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const roots: Array<{ scope: CustomCommandScope; dir: string }> = [
    { scope: "project", dir: path.join(projectPath, ".deepseekcode", "commands") },
    { scope: "user", dir: userHome ? path.join(userHome, ".deepseekcode", "commands") : "" },
    { scope: "cache", dir: path.join(dataDir, "cache", "commands") },
  ];
  const documents: CustomCommandDocument[] = [];

  for (const root of roots) {
    if (!root.dir || !fs.existsSync(root.dir)) continue;
    for (const entry of fs.readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
      const fullPath = path.join(root.dir, entry.name);
      const parsed = parseCommandMarkdown(fs.readFileSync(fullPath, "utf8"));
      const name = normalizeCommandName(path.basename(entry.name, ".md"));
      if (!name || !parsed.prompt.trim()) continue;
      documents.push({
        name,
        scope: root.scope,
        path: fullPath,
        description: parsed.description ?? firstUsefulLine(parsed.prompt) ?? "Custom prompt command.",
        usage: parsed.usage,
        aliases: parsed.aliases,
        prompt: parsed.prompt,
      });
    }
  }

  return documents.sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}

function toSlashCommand(document: CustomCommandDocument): Command {
  const commandName = `${document.scope}:${document.name}`;
  return {
    name: commandName,
    aliases: document.aliases.map((alias) => `${document.scope}:${alias}`),
    description: `[${document.scope} command] ${document.description}`,
    usage: document.usage,
    execute(args, context) {
      const rendered = renderTemplate(document.prompt, {
        args,
        command: document.name,
        scope: document.scope,
        project: context.config.projectPath,
      }).trim();
      return {
        message: `Running custom command /${commandName}`,
        submit: rendered,
      };
    },
  };
}

function parseCommandMarkdown(content: string): {
  description?: string;
  usage?: string;
  aliases: string[];
  prompt: string;
} {
  if (!content.startsWith("---")) {
    return { aliases: [], prompt: content };
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { aliases: [], prompt: content };
  const metadata = parseFrontmatter(content.slice(3, end));
  const prompt = content.slice(end + "\n---".length).replace(/^\r?\n/, "");
  return {
    description: metadata.description,
    usage: metadata.usage,
    aliases: splitList(metadata.aliases),
    prompt,
  };
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

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((entry) => normalizeCommandName(stripQuotes(entry.trim())))
    .filter(Boolean);
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

function normalizeCommandName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function firstUsefulLine(content: string): string | undefined {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line && !line.startsWith("---"));
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(args|command|scope|project)\}/g, (_, key: string) => values[key] ?? "");
}
