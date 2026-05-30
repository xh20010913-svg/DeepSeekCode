import test from "node:test";
import assert from "node:assert/strict";
import { agentPathLabel } from "./agentFileUtils.js";
import { agentDetailModel } from "./AgentDetail.js";
import { agentsListOptions } from "./AgentsList.js";
import { agentsMenuOptions } from "./AgentsMenu.js";
import { generateAgentMarkdown } from "./generateAgent.js";
import { modelSelectorOptions } from "./ModelSelector.js";
import { agentNavigationItems } from "./AgentNavigationFooter.js";
import { toolSelectorOptions } from "./ToolSelector.js";
import { validateAgentDraft } from "./validateAgent.js";

const projectPath = "D:\\code\\DeepSeekCode";

test("agents list maps summaries to scoped select options", () => {
  const options = agentsListOptions({
    projectPath,
    selectedId: "project:reviewer",
    agents: [
      {
        name: "reviewer",
        scope: "project",
        path: "D:\\code\\DeepSeekCode\\.deepseekcode\\agents\\reviewer.md",
        description: "Reviews code changes before release.",
      },
    ],
  });

  assert.equal(options[0]?.id, "project:reviewer");
  assert.equal(options[0]?.selected, true);
  assert.equal(options[0]?.tone, "success");
  assert.match(options[0]?.detail ?? "", /\.deepseekcode/);
});

test("agent detail summarizes model, tools, path, and prompt", () => {
  const model = agentDetailModel({
    projectPath,
    agent: {
      name: "reviewer",
      scope: "project",
      path: "D:\\code\\DeepSeekCode\\.deepseekcode\\agents\\reviewer.md",
      description: "Review code.",
      frontmatter: { name: "reviewer" },
      prompt: "Check risk.\nReport tests.",
      model: "deepseek-v4-flash",
      tools: ["read_file", "run_command", "apply_patch", "search"],
      skills: ["typescript"],
    },
  });

  assert.equal(model.rows.find((row) => row.label === "model")?.value, "deepseek-v4-flash");
  assert.equal(model.rows.find((row) => row.label === "tools")?.value, "read_file, run_command, apply_patch, search");
  assert.equal(model.promptPreview[0], "Check risk.");
});

test("model selector keeps flash as the cheap testing default", () => {
  const options = modelSelectorOptions("deepseek-v4-flash");

  assert.equal(options.find((option) => option.id === "deepseek-v4-flash")?.selected, true);
  assert.match(options.find((option) => option.id === "deepseek-v4-flash")?.detail ?? "", /cheap/);
});

test("tool selector marks selected tools", () => {
  const options = toolSelectorOptions(["run command", "read_file"], ["read_file"]);

  assert.equal(options.find((option) => option.id === "read_file")?.selected, true);
  assert.equal(options.find((option) => option.id === "run-command")?.detail, "available");
});

test("agent draft validation catches missing required fields", () => {
  const result = validateAgentDraft({
    name: "",
    description: "",
    model: "deepseek-v4-flash",
    color: "cyan",
    tools: [],
    prompt: "",
    maxTurns: 0,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /agent name/);
  assert.match(result.errors.join("\n"), /prompt/);
  assert.match(result.warnings.join("\n"), /description/);
});

test("generated agent markdown uses normalized frontmatter", () => {
  const markdown = generateAgentMarkdown({
    name: "Code Reviewer",
    description: "Review risky code changes.",
    model: "deepseek-v4-flash",
    color: "green",
    tools: ["read_file", "run_command"],
    prompt: "Review the diff and return blocking issues first.",
    maxTurns: 3,
  });

  assert.match(markdown, /name: code-reviewer/);
  assert.match(markdown, /tools: read_file, run_command/);
  assert.match(markdown, /Review the diff/);
});

test("agent path labels compact project paths", () => {
  const label = agentPathLabel("D:\\code\\DeepSeekCode\\.deepseekcode\\agents\\reviewer.md", projectPath);

  assert.match(label, /\.deepseekcode/);
  assert.doesNotMatch(label, /^D:/);
});

test("agents menu and navigation disable unavailable actions", () => {
  const menu = agentsMenuOptions({ hasAgents: false, hasSelection: false });
  const nav = agentNavigationItems("detail");

  assert.equal(menu.find((item) => item.id === "run")?.disabled, true);
  assert.equal(nav.find((item) => item.id === "back")?.command, "esc");
});
