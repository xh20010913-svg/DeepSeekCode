import fs from "node:fs";
import path from "node:path";

export type EffortLevel = "auto" | "low" | "medium" | "high" | "max";

export interface InferenceBudget {
  effort: EffortLevel;
  actionContextChars: number;
  actionDynamicChars: number;
  sideQuestionContextChars: number;
  sideQuestionDynamicChars: number;
  maxOutputTokens: number;
}

interface InferenceSettingsDocument {
  effort?: EffortLevel;
}

const BUDGETS: Record<EffortLevel, InferenceBudget> = {
  auto: {
    effort: "auto",
    actionContextChars: 18_000,
    actionDynamicChars: 24_000,
    sideQuestionContextChars: 12_000,
    sideQuestionDynamicChars: 16_000,
    maxOutputTokens: 1200,
  },
  low: {
    effort: "low",
    actionContextChars: 8_000,
    actionDynamicChars: 12_000,
    sideQuestionContextChars: 6_000,
    sideQuestionDynamicChars: 8_000,
    maxOutputTokens: 700,
  },
  medium: {
    effort: "medium",
    actionContextChars: 14_000,
    actionDynamicChars: 18_000,
    sideQuestionContextChars: 10_000,
    sideQuestionDynamicChars: 12_000,
    maxOutputTokens: 1000,
  },
  high: {
    effort: "high",
    actionContextChars: 18_000,
    actionDynamicChars: 24_000,
    sideQuestionContextChars: 12_000,
    sideQuestionDynamicChars: 16_000,
    maxOutputTokens: 1200,
  },
  max: {
    effort: "max",
    actionContextChars: 28_000,
    actionDynamicChars: 36_000,
    sideQuestionContextChars: 18_000,
    sideQuestionDynamicChars: 24_000,
    maxOutputTokens: 1800,
  },
};

export class InferenceSettingsService {
  constructor(private readonly projectPath: string) {}

  current(): EffortLevel {
    return readInferenceEffort(this.projectPath);
  }

  effective(): InferenceBudget {
    return budgetFor(this.current());
  }

  set(level: EffortLevel): InferenceBudget {
    const settingsPath = this.path();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify({ effort: level }, null, 2)}\n`, "utf8");
    return budgetFor(level);
  }

  clear(): InferenceBudget {
    const settingsPath = this.path();
    if (fs.existsSync(settingsPath)) fs.rmSync(settingsPath, { force: true });
    return budgetFor("auto");
  }

  path(): string {
    return path.join(this.projectPath, ".deepseekcode", "inference.json");
  }
}

export function readInferenceEffort(projectPath: string): EffortLevel {
  const env = normalizeEffort(process.env.DEEPSEEKCODE_EFFORT);
  if (env) return env;
  const settingsPath = path.join(projectPath, ".deepseekcode", "inference.json");
  if (!fs.existsSync(settingsPath)) return "auto";
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as InferenceSettingsDocument;
    return normalizeEffort(parsed.effort) ?? "auto";
  } catch {
    return "auto";
  }
}

export function budgetFor(level: EffortLevel): InferenceBudget {
  return { ...BUDGETS[level] };
}

export function normalizeEffort(value: unknown): EffortLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isEffortLevel(normalized) ? normalized : null;
}

export function isEffortLevel(value: string): value is EffortLevel {
  return ["auto", "low", "medium", "high", "max"].includes(value);
}

export function formatInferenceBudget(budget: InferenceBudget): string {
  return [
    `effort=${budget.effort}`,
    `actionContext=${budget.actionContextChars}`,
    `dynamic=${budget.actionDynamicChars}`,
    `sideQuestion=${budget.sideQuestionContextChars}/${budget.sideQuestionDynamicChars}`,
    `maxOutput=${budget.maxOutputTokens}`,
  ].join(" ");
}
