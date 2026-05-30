import { z } from "zod";
import { buildTool, type Tool, type ToolExecutionContext } from "../Tool.js";
import { baseTools } from "./registry.js";

const TOOL_ALIASES: Record<string, string> = {
  AgentTool: "invoke_agent",
  AskUserQuestionTool: "AskUserQuestion",
  BashTool: "run_command",
  PowerShellTool: "run_command",
  EnterPlanModeTool: "EnterPlanMode",
  ExitPlanModeTool: "ExitPlanMode",
  FileEditTool: "apply_patch",
  FileReadTool: "read_file",
  FileWriteTool: "write_file",
  GlobTool: "glob_files",
  GrepTool: "grep_files",
  ListMcpResourcesTool: "mcp_call",
  MCPTool: "mcp_call",
  ReadMcpResourceTool: "mcp_call",
  SkillTool: "invoke_skill",
  TodoWriteTool: "TodoWrite",
  WebBrowserTool: "browser_snapshot",
  WebFetchTool: "browser_snapshot",
  WebSearchTool: "browser_snapshot",
  ReviewArtifactTool: "validate_artifact",
};

export interface ToolAdapterInfo {
  referenceName: string;
  targetName: string;
  implemented: boolean;
}

export function createToolAdapter(referenceName: string): Tool<Record<string, unknown>> {
  const normalized = normalizeToolReference(referenceName);
  const targetName = toolTargetName(normalized);
  return buildTool({
    name: normalized,
    displayName: normalized,
    description: `ClaudeCode path-compatible adapter for DeepSeekCode tool ${targetName}.`,
    inputSchema: z.record(z.unknown()),
    readOnly(input) {
      const target = findLocalTool(targetName);
      if (!target) return true;
      const parsed = target.inputSchema.safeParse(input);
      return parsed.success ? target.isReadOnly(parsed.data) : true;
    },
    concurrencySafe(input) {
      const target = findLocalTool(targetName);
      if (!target) return true;
      const parsed = target.inputSchema.safeParse(input);
      return parsed.success ? target.isConcurrencySafe(parsed.data) : true;
    },
    destructive(input) {
      const target = findLocalTool(targetName);
      if (!target) return false;
      const parsed = target.inputSchema.safeParse(input);
      return parsed.success ? target.isDestructive(parsed.data) : false;
    },
    async run(input, context) {
      const target = findLocalTool(targetName);
      if (!target) return missingToolResult(normalized, targetName);
      const parsed = target.inputSchema.safeParse(input);
      if (!parsed.success) {
        return {
          result: {
            action_type: normalized,
            status: "failed",
            message: `Input does not match DeepSeekCode ${target.name}: ${parsed.error.issues[0]?.message ?? "invalid input"}`,
          },
        };
      }
      return target.run(parsed.data, context as ToolExecutionContext);
    },
  });
}

export function toolAdapterInfo(referenceName: string): ToolAdapterInfo {
  const normalized = normalizeToolReference(referenceName);
  const targetName = toolTargetName(normalized);
  return {
    referenceName: normalized,
    targetName,
    implemented: Boolean(findLocalTool(targetName)),
  };
}

export function normalizeToolReference(value: string): string {
  const parts = value.replace(/\\/g, "/").split("/").filter(Boolean);
  const first = parts[0] ?? value;
  return first.replace(/\.(tsx?|jsx?)$/, "");
}

export function toolTargetName(referenceName: string): string {
  return TOOL_ALIASES[referenceName] ?? referenceName;
}

function findLocalTool(name: string): Tool | undefined {
  return baseTools.find((tool) => tool.name === name);
}

function missingToolResult(referenceName: string, targetName: string) {
  return {
    result: {
      action_type: referenceName,
      status: "failed" as const,
      message: `${referenceName} is present as a compatibility source path, but DeepSeekCode has not implemented ${targetName} yet.`,
    },
  };
}
