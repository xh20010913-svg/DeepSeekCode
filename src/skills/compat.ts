export interface BundledSkillAdapter {
  name: string;
  description: string;
  source: "deepseekcode";
  referencePath: string;
}

const SKILL_DESCRIPTIONS: Record<string, string> = {
  batch: "Plan bounded multi-step local work while preserving DeepSeek cache reuse.",
  debug: "Inspect failing local commands, tests, hooks, and tool traces.",
  keybindings: "Design terminal-safe DeepSeekCode shortcut bindings.",
  loop: "Run iterative plan, edit, test, and review loops with explicit gates.",
  remember: "Capture stable project facts as memory or cache pins.",
  simplify: "Reduce noisy code paths while keeping behavior and tests intact.",
  skillify: "Turn repeatable workflows into DeepSeekCode skills.",
  stuck: "Recover from blocked tool loops with diagnostics and smaller next steps.",
  verify: "Validate local artifacts, CLI behavior, and server workflows.",
};

export function createSkillAdapter(referencePath: string): BundledSkillAdapter {
  const name = normalizeSkillReference(referencePath);
  return {
    name,
    description: SKILL_DESCRIPTIONS[name] ?? `DeepSeekCode skill compatibility entry for ${name}.`,
    source: "deepseekcode",
    referencePath,
  };
}

export function normalizeSkillReference(referencePath: string): string {
  const cleaned = referencePath.replace(/\\/g, "/").replace(/\.(tsx?|jsx?|md)$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts[0] === "bundled" && parts[1]) return parts[1].toLowerCase();
  return (parts[0] ?? cleaned).toLowerCase();
}

export const bundledSkillAdapters: BundledSkillAdapter[] = [
  "batch",
  "debug",
  "keybindings",
  "loop",
  "remember",
  "simplify",
  "skillify",
  "stuck",
  "verify",
].map((name) => createSkillAdapter(`bundled/${name}`));
