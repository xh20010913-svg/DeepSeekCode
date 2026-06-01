import type { RuntimeConfig } from "../../bootstrap/config.js";
import { buildContextBundle, contextBundlePrompt } from "../../context/contextBundle.js";
import type { ActionEnvelope, ActionExecutionReport, ActionResult } from "../../protocol/actions.js";
import { actionType } from "../../protocol/actions.js";
import type { DeepSeekProviderClient } from "../../protocol/provider.js";
import type { RuntimePermissionState } from "../permissions/permissionProfiles.js";
import { executeEnvelope } from "../../tools/executor.js";
import { defaultShellPolicy } from "../../tools/shell.js";
import { loadAgent, type LoadedAgent } from "../../agents/loader.js";
import { buildActionSystemPrompt } from "../../query/systemPrompt.js";

export interface AgentRunResult {
  agent: LoadedAgent;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
  turns: AgentRunTurn[];
}

export interface AgentRunTurn {
  index: number;
  envelope: ActionEnvelope;
  execution: ActionExecutionReport;
}

export async function runAgentTask(input: {
  name: string;
  task: string;
  config: RuntimeConfig;
  provider: DeepSeekProviderClient;
  permissions: RuntimePermissionState;
  feedback?: ActionExecutionReport;
  signal?: AbortSignal;
}): Promise<AgentRunResult> {
  const agent = loadAgent(input.config.projectPath, input.config.dataDir, input.name);
  if (!agent) throw new Error(`agent not found: ${input.name}`);

  const bundle = buildContextBundle(input.config.projectPath, 12_000, input.task);
  const maxTurns = normalizeMaxTurns(agent.frontmatter.maxTurns);
  const turns: AgentRunTurn[] = [];
  let feedback = input.feedback;

  for (let index = 1; index <= maxTurns; index += 1) {
    const envelope = await input.provider.planActions({
      userMessage: [
        `Subagent: ${agent.name}`,
        `Task: ${input.task}`,
        `Turn: ${index}/${maxTurns}`,
        `Description: ${agent.description || "(none)"}`,
        `Allowed tools: ${agent.tools?.join(", ") || "inherited"}`,
        `Disallowed tools: ${agent.frontmatter.disallowedTools?.join(", ") || "(none)"}`,
        `Runtime permissions: shell=${input.permissions.allowShell ? "enabled" : "disabled"} browser=${input.permissions.allowBrowser ? "enabled" : "disabled"} profile=${input.permissions.profile ?? input.config.permissionProfile}`,
        "If shell is disabled, do not use run_command, ssh_run, or shell-backed MCP calls.",
        "",
        "<agent_system_prompt>",
        agent.prompt,
        "</agent_system_prompt>",
      ].join("\n"),
      systemPrompt: buildActionSystemPrompt(),
      contextSummary: contextBundlePrompt(bundle),
      feedback,
    }, {
      signal: input.signal,
    });

    const policyViolation = enforceAgentToolPolicy(envelope, agent);
    const execution = policyViolation
      ? {
        final_message: policyViolation.message ?? "agent tool policy denied an action",
        status: "failed",
        results: [policyViolation],
      } satisfies ActionExecutionReport
      : await executeEnvelope(input.config.projectPath, envelope, {
        shellPolicy: { ...defaultShellPolicy, allowShell: input.permissions.allowShell },
        browserPolicy: { allowBrowser: input.permissions.allowBrowser },
        dataDir: input.config.dataDir,
        abortSignal: input.signal,
      });

    turns.push({ index, envelope, execution });
    if (execution.status === "succeeded" || index === maxTurns) {
      return { agent, envelope, execution, turns };
    }
    feedback = execution;
  }

  throw new Error("agent run ended without a turn");
}

function enforceAgentToolPolicy(envelope: ActionEnvelope, agent: LoadedAgent): ActionResult | null {
  const allowed = agent.tools?.length ? new Set(agent.tools) : null;
  const disallowed = new Set(agent.frontmatter.disallowedTools ?? []);
  for (const action of envelope.actions) {
    const type = actionType(action);
    if (disallowed.has(type)) {
      return {
        action_type: type,
        status: "failed",
        message: `agent ${agent.name} is not allowed to use tool: ${type}`,
      };
    }
    if (allowed && !allowed.has(type)) {
      return {
        action_type: type,
        status: "failed",
        message: `agent ${agent.name} is not allowed to use tool: ${type}`,
      };
    }
  }
  return null;
}

function normalizeMaxTurns(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(1, Math.trunc(value)));
}
