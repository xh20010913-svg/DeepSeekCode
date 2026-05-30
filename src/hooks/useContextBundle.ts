import { useMemo } from "react";
import { buildContextBundle, type ContextBundle } from "../context/contextBundle.js";

export function useContextBundle(projectPath: string, budgetChars = 16_000): ContextBundle {
  return useMemo(() => buildContextBundle(projectPath, budgetChars), [projectPath, budgetChars]);
}
