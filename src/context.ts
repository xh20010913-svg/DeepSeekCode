import { buildContextBundle, contextBundlePrompt } from "./context/contextBundle.js";
import { readProjectMemory } from "./memdir/projectMemory.js";

export interface SystemContextInput {
  projectPath: string;
  includeMemory?: boolean;
}

export function getSystemContext(input: SystemContextInput): Record<string, string> {
  const bundle = buildContextBundle(input.projectPath, 12_000);
  return {
    repository_map: bundle.repositoryMap.files
      .map((file) => `${file.path} (${file.size} bytes)`)
      .join("\n"),
    selected_context: contextBundlePrompt(bundle),
    project_memory: input.includeMemory === false ? "" : readProjectMemory(input.projectPath),
  };
}

export function getUserContext(projectPath: string): string {
  const context = getSystemContext({ projectPath });
  return [
    "<project_memory>",
    context.project_memory || "(empty)",
    "</project_memory>",
    "",
    "<repository_map>",
    context.repository_map || "(empty)",
    "</repository_map>",
  ].join("\n");
}
