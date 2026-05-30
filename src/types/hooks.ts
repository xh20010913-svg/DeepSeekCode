export type HookEventName = "PreToolUse" | "PostToolUse" | "PostToolUseFailure";

export interface HookMatch {
  event: HookEventName;
  matcher?: string;
}
