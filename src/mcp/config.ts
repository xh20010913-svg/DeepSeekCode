import { z } from "zod";

export const McpServerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["stdio", "http", "websocket"]),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().optional(),
  env: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
  description: z.string().default(""),
});

export const McpConfigSchema = z.object({
  servers: z.array(McpServerSchema).default([]),
});

export type McpServerConfig = z.infer<typeof McpServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

export interface McpValidationResult {
  name: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function parseMcpConfig(value: unknown): McpConfig {
  return McpConfigSchema.parse(value);
}

export function renderMcpConfig(config: McpConfig): string {
  return `${JSON.stringify(parseMcpConfig(config), null, 2)}\n`;
}

export function normalizeMcpName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateMcpServer(server: McpServerConfig): McpValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (normalizeMcpName(server.name) !== server.name) errors.push(`server name '${server.name}' is not normalized`);
  if (server.type === "stdio" && !server.command?.trim()) errors.push("stdio server requires command");
  if ((server.type === "http" || server.type === "websocket") && !server.url?.trim()) errors.push(`${server.type} server requires url`);
  if (server.command && /^[A-Za-z]:[\\/]/.test(server.command)) {
    warnings.push("command is absolute; prefer a PATH command or project-local wrapper");
  }
  for (const key of Object.keys(server.env)) {
    if (/key|token|secret|password/i.test(key)) warnings.push(`env '${key}' may contain a secret; prefer environment variable references`);
  }
  return { name: server.name, ok: errors.length === 0, errors, warnings };
}
