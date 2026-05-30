import { z } from "zod";

export const HookEventSchema = z.enum([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "UserPromptSubmit",
  "SessionStart",
  "Stop",
  "StopFailure",
  "PreCompact",
  "PostCompact",
  "TaskCreated",
  "TaskCompleted",
  "Setup",
]);

export type HookEvent = z.infer<typeof HookEventSchema>;

export const HOOK_EVENTS = HookEventSchema.options;

export function isHookEvent(value: string): value is HookEvent {
  return HOOK_EVENTS.includes(value as HookEvent);
}
