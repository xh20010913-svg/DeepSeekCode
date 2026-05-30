import { useMemo } from "react";
import { getCommands } from "../commands/index.js";

export function useCommands() {
  return useMemo(() => getCommands(), []);
}
