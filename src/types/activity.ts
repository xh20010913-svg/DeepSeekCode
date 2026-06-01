export type QueryActivityPhase =
  | "starting"
  | "command"
  | "classifying"
  | "cache_guard"
  | "planning"
  | "chatting"
  | "tool"
  | "validating"
  | "waiting_user"
  | "finishing";

export interface RunActivityView {
  phase: QueryActivityPhase;
  text: string;
  detail?: string;
  startedAtMs: number;
  updatedAtMs: number;
}
