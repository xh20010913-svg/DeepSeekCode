import {
  type ActionEnvelope,
  type ActionExecutionReport,
  type ActionResult,
} from "../protocol/actions.js";
import { requireApprovalForToolAction, type ToolApprovalPolicy } from "../services/approval/approvalPolicy.js";
import { executeToolPlan, type ToolRunEvent } from "../services/tools/toolOrchestration.js";
import type { StateStore } from "../state/sqlite.js";
import type { FileStateCache } from "../utils/fileStateCache.js";
import { baseTools } from "./registry.js";
import type { ShellPolicy } from "./shell.js";

export interface ExecutionOptions {
  shellPolicy?: ShellPolicy;
  browserPolicy?: { allowBrowser: boolean };
  dataDir?: string;
  onToolEvent?: (event: ToolRunEvent) => void | ActionResult | Promise<void | ActionResult>;
  approvalPolicy?: ToolApprovalPolicy;
  fileStateCache?: FileStateCache;
  state?: StateStore;
  runId?: string;
}

export async function executeEnvelope(
  root: string,
  envelope: ActionEnvelope,
  options: ExecutionOptions = {},
): Promise<ActionExecutionReport> {
  const results: ActionResult[] = await executeToolPlan(
    baseTools,
    envelope.actions,
    {
      root,
      allowShell: options.shellPolicy?.allowShell ?? false,
      allowBrowser: options.browserPolicy?.allowBrowser ?? false,
      dataDir: options.dataDir,
      fileStateCache: options.fileStateCache,
      state: options.state,
      runId: options.runId,
    },
    {
      onEvent: options.onToolEvent,
      onBeforeTool: (tool, action, context) =>
        requireApprovalForToolAction(options.approvalPolicy, tool, action, context),
    },
  );

  return {
    final_message: envelope.final_message,
    status: results.every((result) => result.status === "succeeded")
      ? "succeeded"
      : "failed",
    results,
  };
}
