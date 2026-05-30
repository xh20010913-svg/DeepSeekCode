import fs from "node:fs";
import path from "node:path";

export interface CacheGuardPolicy {
  strict: boolean;
  minHitRate: number;
  source: "env" | "project" | "default";
  path: string;
}

interface CacheGuardPolicyDocument {
  strict?: boolean;
  minHitRate?: number;
}

const DEFAULT_POLICY = {
  strict: false,
  minHitRate: 0.35,
};

export class CacheGuardPolicyService {
  constructor(private readonly projectPath: string) {}

  current(): CacheGuardPolicy {
    const project = this.readProjectPolicy();
    const envStrict = normalizeBoolean(process.env.DEEPSEEKCODE_CACHE_GUARD_STRICT);
    const envMinHitRate = normalizeHitRate(process.env.DEEPSEEKCODE_CACHE_GUARD_MIN_HIT);
    if (envStrict !== undefined || envMinHitRate !== undefined) {
      return {
        strict: envStrict ?? project?.strict ?? DEFAULT_POLICY.strict,
        minHitRate: envMinHitRate ?? project?.minHitRate ?? DEFAULT_POLICY.minHitRate,
        source: "env",
        path: this.path(),
      };
    }
    if (project) {
      return { ...project, source: "project", path: this.path() };
    }
    return { ...DEFAULT_POLICY, source: "default", path: this.path() };
  }

  setStrict(strict: boolean): CacheGuardPolicy {
    const current = this.current();
    return this.write({ strict, minHitRate: current.minHitRate });
  }

  setMinHitRate(value: unknown): CacheGuardPolicy {
    const minHitRate = normalizeHitRate(value);
    if (minHitRate === undefined) {
      throw new Error("cache guard min-hit must be a percent from 0 to 100, or a decimal from 0 to 1");
    }
    const current = this.current();
    return this.write({ strict: current.strict, minHitRate });
  }

  reset(): CacheGuardPolicy {
    if (fs.existsSync(this.path())) fs.rmSync(this.path(), { force: true });
    return this.current();
  }

  path(): string {
    return path.join(this.projectPath, ".deepseekcode", "cache-guard.json");
  }

  private write(policy: Pick<CacheGuardPolicy, "strict" | "minHitRate">): CacheGuardPolicy {
    fs.mkdirSync(path.dirname(this.path()), { recursive: true });
    fs.writeFileSync(this.path(), `${JSON.stringify(policy, null, 2)}\n`, "utf8");
    return { ...policy, source: "project", path: this.path() };
  }

  private readProjectPolicy(): Pick<CacheGuardPolicy, "strict" | "minHitRate"> | undefined {
    if (!fs.existsSync(this.path())) return undefined;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.path(), "utf8")) as CacheGuardPolicyDocument;
      return {
        strict: typeof parsed.strict === "boolean" ? parsed.strict : DEFAULT_POLICY.strict,
        minHitRate: normalizeHitRate(parsed.minHitRate) ?? DEFAULT_POLICY.minHitRate,
      };
    } catch {
      return undefined;
    }
  }
}

export function formatCacheGuardPolicy(policy: CacheGuardPolicy): string {
  return [
    "DeepSeek cache guard policy",
    `strict=${policy.strict ? "on" : "off"} minHit=${Math.round(policy.minHitRate * 100)}% source=${policy.source}`,
    `path=${policy.path}`,
    "commands:",
    "- /cache guard strict on|off",
    "- /cache guard min-hit <percent>",
    "- /cache guard reset",
  ].join("\n");
}

export function normalizeHitRate(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!raw) return undefined;
  const percent = raw.endsWith("%");
  const numeric = Number.parseFloat(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(numeric)) return undefined;
  const normalized = percent || numeric > 1 ? numeric / 100 : numeric;
  if (normalized < 0 || normalized > 1) return undefined;
  return normalized;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return undefined;
}
