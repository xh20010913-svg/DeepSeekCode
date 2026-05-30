import { useMemo } from "react";
import { summarizeGitStatus, type GitStatusSummary } from "../services/status/projectStatus.js";

export function useGitStatus(projectPath: string): GitStatusSummary {
  return useMemo(() => summarizeGitStatus(projectPath), [projectPath]);
}
