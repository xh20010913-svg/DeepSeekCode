export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;
  decision: PermissionDecision;
  reason?: string;
}
