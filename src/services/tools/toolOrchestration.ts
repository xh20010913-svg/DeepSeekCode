import type { Tool, ToolExecutionContext, Tools } from "../../Tool.js";
import { findToolByName, parseToolInput } from "../../Tool.js";
import { actionType, type ActionRequest, type ActionResult } from "../../protocol/actions.js";

export interface ToolRunEvent {
  action: ActionRequest;
  phase: "start" | "finish";
  result?: ActionResult;
}

export interface ToolOrchestrationOptions {
  onEvent?: (event: ToolRunEvent) => void | ActionResult | Promise<void | ActionResult>;
  onBeforeTool?: (
    tool: Tool,
    action: ActionRequest,
    context: ToolExecutionContext,
  ) => void | ActionResult | Promise<void | ActionResult>;
}

export async function executeToolPlan(
  tools: Tools,
  actions: ActionRequest[],
  context: ToolExecutionContext,
  options: ToolOrchestrationOptions = {},
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  const batches = partitionActions(tools, actions, context);

  for (const batch of batches) {
    if (batch.parallel) {
      const batchResults = await Promise.all(
        batch.items.map((item) => runOneTool(item.tool, item.input, context, options)),
      );
      results.push(...batchResults);
    } else {
      for (const item of batch.items) {
        results.push(await runOneTool(item.tool, item.input, context, options));
      }
    }
  }

  return results;
}

interface ToolAction {
  tool: Tool;
  input: ActionRequest;
}

interface ToolBatch {
  parallel: boolean;
  items: ToolAction[];
}

function partitionActions(
  tools: Tools,
  actions: ActionRequest[],
  context: ToolExecutionContext,
): ToolBatch[] {
  const batches: ToolBatch[] = [];
  let readBatch: ToolAction[] = [];

  const flushReadBatch = () => {
    if (readBatch.length > 0) {
      batches.push({ parallel: true, items: readBatch });
      readBatch = [];
    }
  };

  for (const action of actions) {
    const tool = findToolByName(tools, actionType(action));
    if (!tool) {
      flushReadBatch();
      batches.push({
        parallel: false,
        items: [unknownToolAction(action)],
      });
      continue;
    }
    const parsed = parseToolInput(tool, action) as ActionRequest;
    const canParallel =
      tool.isEnabled(context) &&
      tool.isReadOnly(parsed) &&
      tool.isConcurrencySafe(parsed) &&
      tool.checkPermissions(parsed, context).behavior === "allow";

    if (canParallel) {
      readBatch.push({ tool, input: parsed });
    } else {
      flushReadBatch();
      batches.push({ parallel: false, items: [{ tool, input: parsed }] });
    }
  }

  flushReadBatch();
  return batches;
}

async function runOneTool(
  tool: Tool,
  input: ActionRequest,
  context: ToolExecutionContext,
  options: ToolOrchestrationOptions,
): Promise<ActionResult> {
  try {
    const preflight = await options.onEvent?.({ action: input, phase: "start" });
    if (preflight) return finish(input, preflight, options);
    if (!tool.isEnabled(context)) {
      return finish(input, {
        action_type: actionType(input),
        status: "failed",
        message: `${tool.name} is disabled`,
      }, options);
    }
    const permission = tool.checkPermissions(input, context);
    if (permission.behavior === "deny") {
      return finish(input, {
        action_type: actionType(input),
        status: "failed",
        message: permission.message ?? `${tool.name} denied by policy`,
      }, options);
    }
    const beforeTool = await options.onBeforeTool?.(tool, input, context);
    if (beforeTool) return finish(input, beforeTool, options);
    const output = await tool.run(input, context);
    return finish(input, output.result, options);
  } catch (error) {
    return finish(input, {
      action_type: actionType(input),
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    }, options);
  }
}

async function finish(
  action: ActionRequest,
  result: ActionResult,
  options: ToolOrchestrationOptions,
): Promise<ActionResult> {
  await options.onEvent?.({ action, phase: "finish", result });
  return result;
}

function unknownToolAction(action: ActionRequest): ToolAction {
  return {
    input: action,
    tool: {
      name: actionType(action),
      displayName: actionType(action),
      description: "Unknown tool placeholder.",
      inputSchema: { parse: (value: unknown) => value } as Tool["inputSchema"],
      isEnabled: () => true,
      isReadOnly: () => false,
      isConcurrencySafe: () => false,
      isDestructive: () => false,
      checkPermissions: () => ({ behavior: "allow" }),
      async run() {
        return {
          result: {
            action_type: actionType(action),
            status: "failed",
            message: `Unknown action type: ${actionType(action)}`,
          },
        };
      },
    },
  };
}
