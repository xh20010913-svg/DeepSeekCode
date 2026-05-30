import type { EffortLevel } from "../services/inference/inferenceSettingsService.js";

export function effortLevelToSymbol(level: EffortLevel): string {
  if (level === "low") return "L";
  if (level === "medium") return "M";
  if (level === "high") return "H";
  if (level === "max") return "X";
  return "A";
}

export function effortLevelLabel(level: EffortLevel): string {
  if (level === "low") return "token saver";
  if (level === "medium") return "balanced";
  if (level === "high") return "broad context";
  if (level === "max") return "max spend";
  return "auto";
}

export function getEffortNotificationText(level: EffortLevel | undefined, model: string): string {
  const effort = level ?? "auto";
  const modelHint = model.toLowerCase().includes("flash") ? "flash" : "model";
  return `${effortLevelToSymbol(effort)} ${effort} ${modelHint} | /effort`;
}
