import type { RuntimeConfig } from "../../bootstrap/config.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import type { ActionEnvelope, ActionExecutionReport } from "../../protocol/actions.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import { buildActionSystemPrompt } from "../../query/systemPrompt.js";
import { loadSkill, type LoadedSkill } from "../../skills/loader.js";
import { executeEnvelope } from "../../tools/executor.js";
import { defaultShellPolicy } from "../../tools/shell.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";

export interface SkillRunResult {
  skill: LoadedSkill;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
  turns: SkillRunTurn[];
}

export interface SkillRunTurn {
  index: number;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
}

export async function runSkillTask(input: {
  name: string;
  task: string;
  config: RuntimeConfig;
  provider: DeepSeekProviderClient;
  permissions: RuntimePermissionState;
  maxTurns?: number;
}): Promise<SkillRunResult> {
  const skill = loadSkill(input.config.projectPath, input.config.dataDir, input.name);
  if (!skill) throw new Error(`skill not found: ${input.name}`);
  if (skill.frontmatter.disableModelInvocation) {
    throw new Error(`skill ${skill.name} disables model invocation`);
  }

  const bundle = buildContextBundle(input.config.projectPath, 12_000, input.task);
  const turns: SkillRunTurn[] = [];
  let feedback: ActionExecutionReport | undefined;
  const maxTurns = normalizeMaxTurns(input.maxTurns);

  for (let index = 1; index <= maxTurns; index += 1) {
    const envelope = await input.provider.planActions({
      userMessage: [
        `Skill: ${skill.name}`,
        `Task: ${input.task}`,
        `Turn: ${index}/${maxTurns}`,
        `Description: ${skill.description || skill.frontmatter.description || "(none)"}`,
        "",
        "<skill_instructions>",
        skill.prompt,
        "</skill_instructions>",
      ].join("\n"),
      systemPrompt: buildActionSystemPrompt(),
      contextSummary: contextBundlePrompt(bundle),
      feedback,
    });
    const execution = await executeEnvelope(input.config.projectPath, envelope, {
      shellPolicy: { ...defaultShellPolicy, allowShell: input.permissions.allowShell },
      browserPolicy: { allowBrowser: input.permissions.allowBrowser },
      dataDir: input.config.dataDir,
    });
    turns.push({ index, envelope, execution });
    if (execution.status === "succeeded" || index === maxTurns) {
      return { skill, envelope, execution, turns };
    }
    feedback = execution;
  }

  throw new Error("skill run ended without a turn");
}

function normalizeMaxTurns(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 2;
  return Math.min(6, Math.max(1, Math.trunc(value)));
}
