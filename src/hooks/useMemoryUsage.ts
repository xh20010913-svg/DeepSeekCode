import { useEffect, useState } from "react";

export type MemoryUsageStatus = "normal" | "high" | "critical";

export interface MemoryUsageInfo {
  heapUsed: number;
  status: MemoryUsageStatus;
}

export const HIGH_MEMORY_THRESHOLD = 1.5 * 1024 * 1024 * 1024;
export const CRITICAL_MEMORY_THRESHOLD = 2.5 * 1024 * 1024 * 1024;

export function memoryUsageStatus(heapUsed: number): MemoryUsageStatus {
  if (heapUsed >= CRITICAL_MEMORY_THRESHOLD) return "critical";
  if (heapUsed >= HIGH_MEMORY_THRESHOLD) return "high";
  return "normal";
}

export function memoryUsageSnapshot(heapUsed = process.memoryUsage().heapUsed): MemoryUsageInfo | null {
  const status = memoryUsageStatus(heapUsed);
  if (status === "normal") return null;
  return { heapUsed, status };
}

export function useMemoryUsage(pollMs = 10_000): MemoryUsageInfo | null {
  const [memoryUsage, setMemoryUsage] = useState<MemoryUsageInfo | null>(() => memoryUsageSnapshot());

  useEffect(() => {
    const refresh = () => {
      setMemoryUsage((previous) => {
        const next = memoryUsageSnapshot();
        if (!next) return previous === null ? previous : null;
        if (previous?.heapUsed === next.heapUsed && previous.status === next.status) return previous;
        return next;
      });
    };
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  return memoryUsage;
}
