export type AssistantRole = "Commander" | "Planner" | "Builder" | "Tester" | "Reviewer" | "Researcher";

export interface RoleDefinition {
  role: AssistantRole;
  purpose: string;
  allowedTools: string[];
}

export const assistantRoles: RoleDefinition[] = [
  {
    role: "Commander",
    purpose: "Own the global goal, task DAG, acceptance and rework decisions.",
    allowedTools: ["list_files", "read_file"],
  },
  {
    role: "Planner",
    purpose: "Scope the work and produce acceptance criteria.",
    allowedTools: ["list_files", "read_file"],
  },
  {
    role: "Builder",
    purpose: "Create or edit project artifacts.",
    allowedTools: ["list_files", "read_file", "write_file", "apply_patch", "run_command"],
  },
  {
    role: "Tester",
    purpose: "Validate artifacts and checks.",
    allowedTools: ["read_file", "run_command", "validate_artifact"],
  },
  {
    role: "Reviewer",
    purpose: "Accept, reject, or request rework from evidence.",
    allowedTools: ["read_file", "validate_artifact"],
  },
  {
    role: "Researcher",
    purpose: "Gather bounded external or repository context.",
    allowedTools: ["list_files", "read_file", "browser_session_start"],
  },
];
