import { z } from "zod";
import { HookEventSchema, type HookEvent } from "./events.js";

export const HookDefinitionSchema = z.object({
  id: z.string().min(1),
  event: HookEventSchema,
  matcher: z.string().optional(),
  command: z.string().min(1),
  description: z.string().optional(),
  timeout_ms: z.number().int().min(100).max(120_000).default(10_000),
  enabled: z.boolean().default(true),
});

export const HooksConfigSchema = z.object({
  hooks: z.array(HookDefinitionSchema).default([]),
});

export type HookDefinition = z.infer<typeof HookDefinitionSchema>;
export type HooksConfig = z.infer<typeof HooksConfigSchema>;

export interface HooksValidationResult {
  path: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function normalizeHookId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseHooksConfig(value: unknown): HooksConfig {
  return HooksConfigSchema.parse(value);
}

export function renderHooksConfig(config: HooksConfig): string {
  return `${JSON.stringify(parseHooksConfig(config), null, 2)}\n`;
}

export function validateHooksConfig(path: string, content: string | null): HooksValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (content === null) {
    warnings.push("missing hooks.json");
    return { path, ok: true, errors, warnings };
  }

  let config: HooksConfig | null = null;
  try {
    config = parseHooksConfig(JSON.parse(content));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!config) return { path, ok: false, errors, warnings };

  const seen = new Set<string>();
  for (const hook of config.hooks) {
    if (normalizeHookId(hook.id) !== hook.id) {
      errors.push(`hook id '${hook.id}' is not a valid DeepSeekCode hook id`);
    }
    if (seen.has(hook.id)) errors.push(`duplicate hook id '${hook.id}'`);
    seen.add(hook.id);
    if (eventNeedsToolMatcher(hook.event) && !hook.matcher) {
      warnings.push(`hook '${hook.id}' has no tool matcher and will run for every tool`);
    }
  }

  return {
    path,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function eventNeedsToolMatcher(event: HookEvent): boolean {
  return event === "PreToolUse" || event === "PostToolUse" || event === "PostToolUseFailure";
}
