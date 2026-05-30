import { normalizeAgentName } from "../../agents/manifest.js";

export interface AgentWizardPlan {
  name: string;
  description: string;
  tools: string[];
  disallowedTools: string[];
  maxTurns: number;
  color: string;
  prompt: string;
  rationale: string[];
}

export function buildAgentWizardPlan(input: {
  name?: string;
  goal: string;
}): AgentWizardPlan {
  const goal = input.goal.trim();
  if (!goal) throw new Error("agent goal is empty");
  const name = normalizeAgentName(input.name || nameFromGoal(goal));
  if (!name) throw new Error("agent name is empty");
  const lower = goal.toLowerCase();
  const tools = new Set(["read_file", "list_files", "grep_files"]);
  const disallowedTools = new Set<string>();
  const rationale = ["read/list/grep are included so the agent can inspect before acting."];

  if (matches(lower, ["write", "edit", "fix", "implement", "create", "refactor", "迁移", "修复", "实现", "重构"])) {
    tools.add("write_file");
    tools.add("apply_patch");
    tools.add("validate_artifact");
    rationale.push("write/patch/validate are included because the goal implies code or artifact changes.");
  }
  if (matches(lower, ["test", "tests", "run tests", "build", "lint", "typecheck", "ci", "测试", "构建"])) {
    tools.add("run_command");
    rationale.push("run_command is included because the goal mentions tests, builds, or CI verification.");
  } else {
    disallowedTools.add("run_command");
    rationale.push("run_command is denied by default to keep generated agents conservative.");
  }
  if (matches(lower, ["browser", "ui", "page", "web", "html", "frontend", "页面", "前端"])) {
    tools.add("browser_snapshot");
    tools.add("browser_screenshot");
    tools.add("validate_artifact");
    rationale.push("browser snapshot/screenshot are included for UI or web-facing work.");
  }
  if (matches(lower, ["mcp", "tool server", "integration", "connector", "插件", "集成"])) {
    tools.add("mcp_call");
    rationale.push("mcp_call is included because the goal mentions tool integrations.");
  }

  const maxTurns = tools.has("write_file") || tools.has("run_command") ? 3 : 2;
  return {
    name,
    description: `Agent for ${goal}`,
    tools: [...tools],
    disallowedTools: [...disallowedTools].filter((tool) => !tools.has(tool)),
    maxTurns,
    color: colorForGoal(lower),
    prompt: renderSmartAgentPrompt(name, goal, [...tools], maxTurns),
    rationale,
  };
}

export function formatAgentWizardPlan(plan: AgentWizardPlan): string {
  return [
    `name: ${plan.name}`,
    `description: ${plan.description}`,
    `tools: ${plan.tools.join(", ")}`,
    plan.disallowedTools.length ? `disallowed-tools: ${plan.disallowedTools.join(", ")}` : "disallowed-tools: none",
    `max-turns: ${plan.maxTurns}`,
    `color: ${plan.color}`,
    "rationale:",
    ...plan.rationale.map((item) => `- ${item}`),
    "",
    plan.prompt,
  ].join("\n");
}

function renderSmartAgentPrompt(name: string, goal: string, tools: string[], maxTurns: number): string {
  return [
    `You are ${name}, a focused DeepSeekCode subagent.`,
    "",
    `Mission: ${goal}`,
    "",
    "Operating rules:",
    "1. Inspect the repository before making changes; prefer narrow reads and grep over broad context.",
    "2. Preserve DeepSeek cache hits by keeping responses concise and avoiding repeated large context dumps.",
    "3. Use only the tools declared in this agent frontmatter.",
    "4. Prefer apply_patch for surgical edits; use write_file only for new files or complete replacements.",
    "5. Validate changed artifacts when a validation tool is available.",
    `6. Finish within ${maxTurns} turn${maxTurns === 1 ? "" : "s"} or return a precise blocker.`,
    "",
    `Available tool policy: ${tools.join(", ")}`,
    "",
    "Return format:",
    "- What changed or what was found",
    "- Evidence, including file paths or command/test names",
    "- Remaining risks or next action",
  ].join("\n");
}

function nameFromGoal(goal: string): string {
  return goal
    .split(/\s+/)
    .slice(0, 4)
    .join("-")
    .replace(/[^A-Za-z0-9_-]+/g, "-");
}

function matches(value: string, needles: string[]): boolean {
  return needles.some((needle) => {
    if (/^[a-z0-9_-]+$/i.test(needle)) {
      return new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(needle)}([^a-z0-9_-]|$)`, "i").test(value);
    }
    return value.includes(needle);
  });
}

function colorForGoal(goal: string): string {
  if (matches(goal, ["review", "security", "audit", "审查", "安全"])) return "red";
  if (matches(goal, ["test", "ci", "build", "测试"])) return "green";
  if (matches(goal, ["ui", "browser", "frontend", "前端"])) return "cyan";
  if (matches(goal, ["mcp", "plugin", "插件"])) return "purple";
  return "blue";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
