import type { ToolRunEvent } from "../tools/toolOrchestration.js";
import type { HookEvent } from "../../hooks/events.js";

export function toolRunEventToHookEvent(event: ToolRunEvent): HookEvent {
  if (event.phase === "start") return "PreToolUse";
  return event.result?.status === "succeeded" ? "PostToolUse" : "PostToolUseFailure";
}

export function toolRunEventPayload(event: ToolRunEvent): Record<string, unknown> {
  return {
    tool_name: event.action.type,
    action: event.action,
    result: event.result,
  };
}
