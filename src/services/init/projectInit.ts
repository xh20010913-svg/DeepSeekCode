import fs from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "../../bootstrap/config.js";

export interface InitResult {
  created: string[];
  existing: string[];
}

const DIRECTORIES = [
  ".deepseekcode",
  ".deepseekcode/commands",
  ".deepseekcode/agents",
  ".deepseekcode/skills",
  ".deepseekcode/plugins",
  ".deepseekcode/output-styles",
  ".deepseekcode/cache-pins",
  ".deepseekcode/exports",
];

export function initializeDeepSeekCodeProject(config: RuntimeConfig, force = false): InitResult {
  const result: InitResult = { created: [], existing: [] };
  for (const directory of DIRECTORIES) {
    ensureDirectory(config.projectPath, directory, result);
  }
  ensureFile(
    config.projectPath,
    "DEEPSEEKCODE.md",
    renderProjectGuide(config),
    result,
    force,
  );
  ensureFile(
    config.projectPath,
    ".deepseekcode/memory.md",
    "# DeepSeekCode Project Memory\n\n- Prefer TypeScript runtime work in this repository.\n",
    result,
    force,
  );
  ensureFile(
    config.projectPath,
    ".deepseekcode/commands/verify.md",
    [
      "---",
      "description: Run the standard DeepSeekCode verification loop",
      "usage: [focus]",
      "---",
      "Verify the current DeepSeekCode changes for {args}. Run build, smoke tests, and parity checks when appropriate. Summarize failures with file paths and the next fix.",
      "",
    ].join("\n"),
    result,
    force,
  );
  ensureFile(
    config.projectPath,
    ".deepseekcode/hooks.json",
    [
      "{",
      '  "hooks": []',
      "}",
      "",
    ].join("\n"),
    result,
    force,
  );
  ensureFile(
    config.projectPath,
    ".deepseekcode/mcp.json",
    [
      "{",
      '  "servers": []',
      "}",
      "",
    ].join("\n"),
    result,
    force,
  );
  return result;
}

export function formatInitResult(result: InitResult): string {
  return [
    "DeepSeekCode project initialized",
    result.created.length ? `created:\n${result.created.map((item) => `- ${item}`).join("\n")}` : "created: none",
    result.existing.length ? `existing:\n${result.existing.map((item) => `- ${item}`).join("\n")}` : "existing: none",
  ].join("\n");
}

function ensureDirectory(root: string, relativePath: string, result: InitResult): void {
  const target = path.join(root, relativePath);
  if (fs.existsSync(target)) {
    result.existing.push(relativePath);
    return;
  }
  fs.mkdirSync(target, { recursive: true });
  result.created.push(relativePath);
}

function ensureFile(
  root: string,
  relativePath: string,
  content: string,
  result: InitResult,
  force: boolean,
): void {
  const target = path.join(root, relativePath);
  if (fs.existsSync(target) && !force) {
    result.existing.push(relativePath);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  result.created.push(relativePath);
}

function renderProjectGuide(config: RuntimeConfig): string {
  return [
    "# DEEPSEEKCODE.md",
    "",
    "This file gives DeepSeekCode project-specific guidance.",
    "",
    "## Runtime",
    "",
    `- Default model: \`${config.model}\``,
    "- Keep provider credentials in `.env`; never commit API keys.",
    "- Prefer `/cache plan <goal>` before large DeepSeek requests to preserve cache hit rate.",
    "- Put stable, reusable project facts in `/cache pin add <name> <content>` so DeepSeek can reuse prompt prefixes across turns.",
    "- Use `/status`, `/diff`, `/review`, `/validation`, and `/export` when validating changes.",
    "",
    "## Local Verification",
    "",
    "- Build: `npm.cmd run build`",
    "- Smoke tests: `npm.cmd run smoke`",
    "- Native tool calling parity check: `npm.cmd run parity`",
    "",
    "## Project Conventions",
    "",
    "- The publishable TypeScript implementation lives under `src/`.",
    "- External reference repositories are local development inputs only and are not part of the release tree.",
    "- Do not reintroduce the deleted Rust runtime.",
    "",
  ].join("\n");
}
