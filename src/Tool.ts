import type { z } from "zod";
import type { ActionExecutionReport, ActionResult } from "./protocol/actions.js";
import type { TencentMemoryService } from "./services/memory/tencentMemoryService.js";
import type { StateStore } from "./state/sqlite.js";
import type { FileStateCache } from "./utils/fileStateCache.js";

export interface ToolPermissionContext {
  root: string;
  allowShell: boolean;
  allowBrowser: boolean;
  shellApprovalOverride?: boolean;
  dataDir?: string;
  state?: StateStore;
  runId?: string;
  memoryService?: TencentMemoryService;
}

export interface ToolExecutionContext extends ToolPermissionContext {
  abortSignal?: AbortSignal;
  fileStateCache?: FileStateCache;
  skillRunner?: (input: {
    name: string;
    task: string;
    maxTurns?: number;
  }) => Promise<{
    skill: { name: string; scope: string; path: string };
    execution: ActionExecutionReport;
    turnCount: number;
  }>;
}

export interface PermissionResult {
  behavior: "allow" | "deny";
  message?: string;
}

export interface ToolResult {
  result: ActionResult;
  data?: unknown;
}

export interface Tool<I = unknown> {
  name: string;
  displayName: string;
  description: string;
  inputSchema: z.ZodType<I>;
  isEnabled(context: ToolPermissionContext): boolean;
  isReadOnly(input: I): boolean;
  isConcurrencySafe(input: I): boolean;
  isDestructive(input: I): boolean;
  checkPermissions(input: I, context: ToolPermissionContext): PermissionResult;
  run(input: I, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolDefinition<I> {
  name: string;
  displayName?: string;
  description: string;
  inputSchema: z.ZodType<I>;
  enabled?: (context: ToolPermissionContext) => boolean;
  readOnly?: boolean | ((input: I) => boolean);
  concurrencySafe?: boolean | ((input: I) => boolean);
  destructive?: boolean | ((input: I) => boolean);
  permissions?: (input: I, context: ToolPermissionContext) => PermissionResult;
  run: (input: I, context: ToolExecutionContext) => Promise<ToolResult> | ToolResult;
}

export function buildTool<I>(definition: ToolDefinition<I>): Tool<I> {
  return {
    name: definition.name,
    displayName: definition.displayName ?? definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    isEnabled(context) {
      return definition.enabled ? definition.enabled(context) : true;
    },
    isReadOnly(input) {
      return booleanOrResolver(definition.readOnly, input, false);
    },
    isConcurrencySafe(input) {
      return booleanOrResolver(definition.concurrencySafe, input, false);
    },
    isDestructive(input) {
      return booleanOrResolver(definition.destructive, input, !this.isReadOnly(input));
    },
    checkPermissions(input, context) {
      return definition.permissions ? definition.permissions(input, context) : { behavior: "allow" };
    },
    async run(input, context) {
      return definition.run(input, context);
    },
  };
}

export type Tools = Tool[];

export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

export function parseToolInput<I>(tool: Tool<I>, input: unknown): I {
  return tool.inputSchema.parse(input);
}

export function toolSchemaDigest(tools: Tools): string {
  return tools
    .map((tool) => {
      const flags = [
        tool.isEnabled({ root: "", allowShell: true, allowBrowser: true }) ? "enabled" : "disabled",
        "permissioned",
      ].join(", ");
      return `- ${tool.name}: ${tool.description} (${flags})`;
    })
    .join("\n");
}

function booleanOrResolver<I>(
  value: boolean | ((input: I) => boolean) | undefined,
  input: I,
  fallback: boolean,
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "function") return value(input);
  return fallback;
}
