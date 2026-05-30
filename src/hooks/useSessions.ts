import { useMemo } from "react";
import { SessionStorage } from "../services/session/sessionStorage.js";

export function useSessions(dataDir: string, limit = 10): Array<{
  sessionId: string;
  path: string;
  updatedAtMs: number;
  bytes: number;
}> {
  return useMemo(() => SessionStorage.list(dataDir, limit), [dataDir, limit]);
}
