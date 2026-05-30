import { AttachService } from "../services/attach/attachService.js";
import type { CommandContext } from "../types/command.js";

export function resolveRunId(args: string, context: CommandContext): string | undefined {
  const trimmed = args.trim();
  if (trimmed && trimmed !== "attached" && trimmed !== "current") return trimmed;
  const attached = new AttachService(context.state, context.config.projectPath).current().runId;
  if (attached) return attached;
  return context.state.listRuns(1)[0]?.id;
}

export function stripRunAlias(args: string): string {
  const trimmed = args.trim();
  return trimmed === "attached" || trimmed === "current" ? "" : trimmed;
}
