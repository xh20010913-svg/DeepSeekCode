import { z } from "zod";
import { HookEventSchema } from "../hooks/events.js";

export const PluginCommandManifestSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  description: z.string().default("Plugin command."),
  usage: z.string().optional(),
  response: z.string().optional(),
  prompt: z.string().optional(),
});

export const PluginHookManifestSchema = z.object({
  id: z.string().min(1),
  event: HookEventSchema,
  matcher: z.string().optional(),
  command: z.string().min(1),
  description: z.string().optional(),
  timeout_ms: z.number().int().min(100).max(120_000).default(10_000),
  enabled: z.boolean().default(true),
});

export const PluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().default(""),
  commands: z.array(PluginCommandManifestSchema).default([]),
  agents: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  output_styles: z.array(z.string().min(1)).default([]),
  hooks: z.array(PluginHookManifestSchema).default([]),
});

export type PluginCommandManifest = z.infer<typeof PluginCommandManifestSchema>;
export type PluginHookManifest = z.infer<typeof PluginHookManifestSchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface PluginValidationResult {
  name: string;
  path: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function parsePluginManifest(value: unknown): PluginManifest {
  return PluginManifestSchema.parse(normalizePluginManifestShape(value));
}

export function parsePluginManifestJson(content: string): PluginManifest {
  return parsePluginManifest(JSON.parse(stripJsonBom(content)));
}

function normalizePluginManifestShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = { ...(value as Record<string, unknown>) };
  if (raw.outputStyles && !raw.output_styles) raw.output_styles = raw.outputStyles;
  raw.agents = normalizeStringArray(raw.agents);
  raw.skills = normalizeStringArray(raw.skills);
  raw.output_styles = normalizeStringArray(raw.output_styles);
  raw.commands = normalizeCommands(raw.commands);
  return raw;
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function normalizeCommands(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([name, config]) => {
      if (!config || typeof config !== "object" || Array.isArray(config)) return [];
      const record = config as Record<string, unknown>;
      if (typeof record.content !== "string") return [];
      return [{
        name,
        description: typeof record.description === "string" ? record.description : "Plugin command.",
        prompt: record.content,
        aliases: [],
      }];
    });
  }
  return [];
}

export function normalizePluginName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function renderPluginManifest(input: {
  name: string;
  description: string;
  commandName?: string;
  response?: string;
  prompt?: string;
}): string {
  const name = normalizePluginName(input.name);
  const commandName = normalizePluginName(input.commandName ?? "hello") || "hello";
  const manifest: PluginManifest = {
    name,
    version: "0.1.0",
    description: input.description.trim(),
    commands: [
      {
        name: commandName,
        description: `Run the ${name} plugin command.`,
        response: input.response ?? `DeepSeekCode plugin ${name}/${commandName}: {args}`,
        prompt: input.prompt,
        aliases: [],
      },
    ],
    agents: ["agents"],
    skills: ["skills"],
    output_styles: ["output-styles"],
    hooks: [],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validatePluginManifest(
  name: string,
  pluginPath: string,
  content: string | null,
): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (content === null) {
    errors.push("missing .codex-plugin/plugin.json");
    return { name, path: pluginPath, ok: false, errors, warnings };
  }

  let manifest: PluginManifest | null = null;
  try {
    manifest = parsePluginManifestJson(content);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!manifest) return { name, path: pluginPath, ok: false, errors, warnings };

  if (manifest.name !== name) {
    errors.push(`manifest name '${manifest.name}' does not match directory '${name}'`);
  }
  if (normalizePluginName(manifest.name) !== manifest.name) {
    errors.push(`manifest name '${manifest.name}' is not a valid DeepSeekCode plugin id`);
  }
  if (manifest.commands.length === 0) {
    warnings.push("no slash commands configured");
  }

  const seen = new Set<string>();
  for (const command of manifest.commands) {
    if (normalizePluginName(command.name) !== command.name) {
      errors.push(`command '${command.name}' is not a valid slash command id`);
    }
    if (seen.has(command.name)) {
      errors.push(`duplicate command '${command.name}'`);
    }
    seen.add(command.name);
    if (!command.response && !command.prompt) {
      warnings.push(`command '${command.name}' has no response or prompt`);
    }
  }
  for (const agentsPath of manifest.agents) {
    if (pathEscapesPlugin(agentsPath)) errors.push(`agents path '${agentsPath}' escapes plugin root`);
  }
  for (const skillsPath of manifest.skills) {
    if (pathEscapesPlugin(skillsPath)) errors.push(`skills path '${skillsPath}' escapes plugin root`);
  }
  for (const stylesPath of manifest.output_styles) {
    if (pathEscapesPlugin(stylesPath)) errors.push(`output_styles path '${stylesPath}' escapes plugin root`);
  }
  const hookIds = new Set<string>();
  for (const hook of manifest.hooks) {
    const id = normalizePluginName(hook.id);
    if (!id) errors.push(`hook '${hook.id}' has an empty normalized id`);
    if (hookIds.has(id)) errors.push(`duplicate hook '${hook.id}'`);
    hookIds.add(id);
  }

  return {
    name,
    path: pluginPath,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function pathEscapesPlugin(relativePath: string): boolean {
  return relativePath.includes("..") || /^[A-Za-z]:[\\/]/.test(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\");
}

function stripJsonBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
