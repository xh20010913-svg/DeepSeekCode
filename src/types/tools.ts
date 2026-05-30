export type ToolRisk = "safe" | "write" | "shell" | "network" | "browser";

export interface ToolDescriptor {
  name: string;
  description: string;
  risk?: ToolRisk;
  requiresApproval?: boolean;
}
