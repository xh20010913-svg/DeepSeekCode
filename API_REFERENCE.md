# DeepSeekCode API Reference

Version: `v0.3.3`

This reference covers the public CLI, slash commands, remote commands, tools, and extension surfaces that are stable enough to document.

## CLI

```cmd
deepseekcode [options]
```

| Option | Type | Meaning |
| --- | --- | --- |
| `--project` | path | Project root. Defaults to the current directory. |
| `--data-dir` | path | Runtime data directory. Defaults to `<project>\.deepseekcode`. |
| `--model` | string | Provider model, for example `deepseek-v4-flash` or `deepseek-v4-pro`. |
| `--continue` | flag | Continue the latest session for the project. |
| `--resume` | session id | Resume a known session. |
| `--doctor` | flag | Print diagnostics and exit. |
| `--allow-shell` | flag | Enable shell tools for this process. Commands still pass through permission policy. |
| `--allow-browser` | flag | Enable browser/CDP tools for this process. |
| `--permission-profile` | string | Permission profile such as `safe`, `dev`, `browser`, or `open`. |
| `--wecom` | flag | Start WeCom remote mode. |
| `--wechat-login` | flag | Login personal WeChat OpenClaw. |
| `--wechat` | flag | Start personal WeChat OpenClaw remote mode. |
| `-p`, `--prompt` | string | Run one prompt and exit. |

## Slash Commands

Core:

```text
/help
/status
/status full
/doctor
/tools
/model
/language zh
/shell on
/browser on
/permissions
/cache
/cache report
/memory doctor
/usage
/cost
/runs
/trace <run>
/events <run>
/artifacts
/ask <question>
/stop
```

Remote:

```text
/remote-control
/remote-control status
/remote-control wechat login
/remote-control wechat start
/remote-control wechat stop
/remote-control wecom start
/remote-control wecom stop
```

Skills, plugins, and MCP:

```text
/skills install <source> [name]
/skills install-all <source>
/skills search <query>
/skills validate [name]
/skills run <name> <task>
/plugins install <source>
/plugins validate [name]
/mcp list
/mcp status
/mcp call <server> <tool> <json>
```

Agents:

```text
/agents
/agents start <goal>
/agents status
/agents message <role> <message>
/agents dashboard
/agents dashboard share
/agents dashboard tunnel
/agents dashboard trace
/agents dashboard close
/agents stop
/project processes
/project stop latest|<pid>|all
/terminal reset
```

## Remote Commands

WeChat and WeCom expose a smaller command set:

```text
/help
/status
/status full
/project
/project <path>
/run <task>
/continue
/ask <question>
/artifacts
/usage
/stop
```

Personal WeChat uses text approval:

```text
1  allow once
2  allow for this session
3  reject
4  stop task
```

WeCom may use card approval when the configured adapter supports it.

## Environment Variables

Provider:

| Variable | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key. |
| `DEEPSEEK_BASE_URL` | Optional provider base URL. |
| `DEEPSEEKCODE_MODEL` | Default model. |
| `DEEPSEEKCODE_PROMPT_AUDIT_DIR` | Enables prompt audit output when set. Default off. |

WeCom:

| Variable | Meaning |
| --- | --- |
| `DEEPSEEKCODE_WECOM_BOT_ID` | WeCom bot id. |
| `DEEPSEEKCODE_WECOM_BOT_SECRET` | WeCom bot secret. |
| `DEEPSEEKCODE_WECOM_ALLOWED_USERS` | Optional allowlist. |
| `DEEPSEEKCODE_WECOM_ALLOWED_GROUPS` | Optional group allowlist. |
| `DEEPSEEKCODE_WECOM_PROJECT_ROOTS` | Allowed project roots for remote switching. |
| `DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL` | Optional public HTTPS base URL for read-only multi-agent panel sharing. |
| `DEEPSEEKCODE_AGENT_PANEL_TOKEN_TTL_MS` | Optional dashboard view-token lifetime. Defaults to 30 minutes. |

Personal WeChat OpenClaw:

| Variable | Meaning |
| --- | --- |
| `DEEPSEEKCODE_WECHAT_OPENCLAW_ENABLED` | Enables OpenClaw channel. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_USERS` | Optional user allowlist. |
| `DEEPSEEKCODE_WECHAT_ALLOWED_GROUPS` | Optional group allowlist. |
| `DEEPSEEKCODE_WECHAT_PROJECT_ROOTS` | Allowed project roots for remote switching. |
| `DEEPSEEKCODE_WECHAT_MENTION_NAMES` | Names that activate group chat messages. |
| `DEEPSEEKCODE_WECHAT_QR_POLL_INTERVAL_MS` | QR polling interval. |
| `DEEPSEEKCODE_WECHAT_LONG_POLL_TIMEOUT_MS` | Message long-poll timeout. |

## Provider Tool Surface

DeepSeekCode exposes tools through native provider `tools[]`. Important tool groups:

| Tool group | Examples |
| --- | --- |
| Files | `read_file`, `write_file`, `append_file`, `patch_file`, `list_files`, `glob_files`, `grep_files` |
| Shell | `run_command` |
| Browser | `browser_session_start`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_agent` |
| Artifacts | `validate_artifact`, `create_docx`, `create_pptx`, `create_xlsx`, `create_pdf` |
| Verification | `verify_task`, `verify_project`, `launch_project` |
| Project processes | `list_project_processes`, `stop_project_process`, `terminal_reset` |
| Skills/plugins | `search_skills`, `invoke_skill`, `install_skill`, `install_plugin` |
| MCP | `mcp_call` |
| Agents | `invoke_agent`, `start_agent_workflow`, `approve_agent_workflow_plan`, `revise_agent_workflow_plan`, `regenerate_agent_workflow_plan`, `cancel_agent_workflow_plan`, `run_agent_workflow_step`, `drain_agent_workflow`, `send_agent_message`, `agent_status`, `finish_agent_workflow` |
| Memory | `memory_search`, `memory_capture`, `memory_raw_search` |

## Agent Panel

The Agent Panel is the bundled Pixel Agents read-only observer for multi-agent runs. DeepSeekCode serves the Pixel web UI and supplies runtime snapshots, WebSocket/SSE updates, and trace JSONL. It is started automatically when a workflow begins and can be reopened with `/agents dashboard`. `/agents dashboard share` prints the local or configured public tokenized URL. `/agents dashboard tunnel` starts a Cloudflare Quick Tunnel when `cloudflared` is installed and returns a random tokenized HTTPS URL for WeChat phone viewing.

Snapshot shape:

```ts
interface AgentDashboardSnapshot {
  run?: RunRecord;
  workflow?: AgentWorkflowRecord;
  projectPath: string;
  phase?: "planning" | "awaiting_approval" | "executing" | "reviewing" | "completed" | "blocked" | "cancelled";
  approvalState?: {
    required: boolean;
    approved: boolean;
    decision?: "approved" | "revision_requested" | "regenerate_requested" | "cancelled";
    requestedAt?: string;
    decidedAt?: string;
    revisionRequest?: string;
  };
  overview: {
    objective: string;
    phase: string;
    status: string;
    elapsedMs: number;
    done: number;
    running: number;
    pending: number;
    failed: number;
    total: number;
    staleReason?: string;
    lastTool?: string;
    cacheHitRate?: number;
  };
  rolePlan?: {
    source: "model" | "heuristic";
    plannerNotes?: string;
    roles: Array<{
      role: string;
      responsibility: string;
      contextScope: string;
      allowedTools: string[];
      requiredOutputs: string[];
      assignedSubtasks: string[];
      riskChecks: string[];
      handoffFormat: string;
    }>;
  };
  subtaskGraph: Array<{
    id: string;
    title: string;
    description: string;
    ownerRole: string;
    dependencies: string[];
    acceptanceCriteria: string[];
    expectedArtifacts: string[];
    evidenceRequirements: string[];
    status: "queued" | "running" | "needs_review" | "succeeded" | "failed" | "blocked" | "skipped";
    latestEvent?: string;
    evidence?: string[];
    blockedBy?: string;
  }>;
  generatedSkills: Array<{
    id: string;
    role: string;
    title: string;
    summary: string;
    instructions: string[];
    constraints: string[];
    outputFormat: string;
  }>;
  connectionState: {
    status: "online" | "offline";
    serverHeartbeat: number;
    offlineReason?: string;
  };
  serverHeartbeat: number;
  processes: Array<{
    id: string;
    pid: number;
    cwd: string;
    command: string;
    port?: number | null;
    url?: string | null;
    status: "running" | "stopped" | "exited" | "unknown";
  }>;
  cacheSummary: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    cacheHitRate: number | null;
    approxPromptTokens?: number;
    droppedChars?: number;
    lowHitReason?: string;
  };
  tokenBudget?: Record<string, unknown>;
  roles: Array<{
    role: string;
    responsibility: string;
    currentTask?: string;
    assignedTasks: string[];
    completedTasks: string[];
    blockedBy?: string;
    lastTool?: string;
    lastMessage?: string;
    skills: string[];
    tools: string[];
    acceptance: string[];
    requiredOutputs: string[];
    riskChecks: string[];
    handoffFormat?: string;
    generatedSkillId?: string;
    generatedSkillSummary?: string;
  }>;
  taskBoard: Record<"queued" | "running" | "needs_review" | "succeeded" | "failed", unknown[]>;
  timeline: Array<{ role?: string; status?: string; task?: string; tool?: string; message?: string; artifact?: string }>;
  artifacts: Array<{ kind: string; path: string; preview?: string }>;
  completionSummary: {
    completed: number;
    total: number;
    running: number;
    needsReview: number;
    failed: number;
    blocked: number;
    percent: number;
  };
  mobileSummary: {
    objective: string;
    phase: string;
    approvalStatus: string;
    overallProgress: string;
    activeRoles: string[];
    unfinishedTasks: Array<{ id: string; title: string; role: string; status: string }>;
    blockedTasks: Array<{ id: string; title: string; role: string; blockedBy?: string }>;
    latestArtifacts: string[];
    nextStep: string;
    recentEvents: string[];
  };
  agentDiagnostics: unknown;
}
```

Pixel Agents consumes the runtime snapshot and Pixel-style `agent-trace.jsonl`/SSE stream. The panel does not execute tools or approve permissions.

## `TaskCompletionContract`

`verify_task` accepts a model-authored contract:

```ts
interface TaskCompletionContract {
  objective?: string;
  expectedOutputs?: Array<{
    kind: "code" | "cli" | "web" | "docx" | "pptx" | "xlsx" | "pdf" | "markdown" | "data" | "image" | "automation" | "mcp" | "plugin" | "unknown";
    description: string;
    required: boolean;
  }>;
  acceptanceCriteria?: string[];
  userConstraints?: string[];
  verificationHints?: string[];

  // Legacy aliases are still accepted and normalized.
  goal?: string;
  expected_artifacts?: string[];
  verifiable_behaviors?: string[];
  acceptance_criteria?: string[];
  user_constraints?: string[];
}
```

Runtime uses the contract plus actual files/tool results to choose validators. It does not infer completion from prompt keywords.

## `verify_task`

Generic completion gate for non-chat tasks.

Input:

```ts
{
  type: "verify_task";
  path?: string;
  objective?: string;
  contract?: TaskCompletionContract;
  mode?: "auto" | "quick" | "full";
  install_dependencies?: boolean;
  run_build?: boolean;
  run_tests?: boolean;
  launch?: boolean;
  capture_preview?: boolean;
  timeout_ms?: number;
}
```

Output:

```ts
interface ProjectVerificationReport {
  status: "succeeded" | "failed";
  root: string;
  summary: string;
  checks: Array<{ name: string; status: "passed" | "failed" | "skipped" | "warning"; detail: string }>;
  artifacts: string[];
  previewPath?: string;
  startCommand?: string;
}
```

`verify_task` may call package checks, artifact validators, script discovery, launch smoke checks, and browser/document/data validators. Failed checks are compacted and replayed to the model for repair.

## Agent Workflow Types

```ts
interface AgentRoleSpec {
  name?: string;
  role?: string;
  responsibility: string;
  contextScope?: string;
  allowedTools?: string[];
  preloadedSkills?: string[];
  assignedTasks?: string[];
  skills?: string[];      // legacy alias for preloadedSkills
  tools?: string[];       // legacy alias for allowedTools
  acceptance?: string[];
  acceptanceCriteria?: string[];
  checkpoint?: string;
}

interface StartAgentWorkflowInput {
  objective: string;
  roles?: AgentRoleSpec[];
  contract?: TaskCompletionContract;
  autoApprove?: boolean;
}
```

Workflow tools:

- `start_agent_workflow`: creates a Planner proposal, dynamic role plan, workflow-local role skills, subtask graph, task contract, and Pixel run. It defaults to `awaiting_approval` unless `autoApprove` is explicit.
- `approve_agent_workflow_plan`: marks the current plan approved and moves the workflow into execution on the same Pixel run.
- `revise_agent_workflow_plan`: sends user notes back to Planner and replaces the plan while staying in `awaiting_approval`.
- `regenerate_agent_workflow_plan`: asks Planner/model to create a different role and subtask decomposition, then returns to `awaiting_approval` and asks again before execution.
- `cancel_agent_workflow_plan`: cancels an unapproved or active workflow.
- `run_agent_workflow_step`: runs one dependency-ready subtask with the assigned role's local prompt, generated skill, checkpoint, allowed-tool policy, and summarized upstream context.
- `drain_agent_workflow`: runs role-local steps until the workflow completes, blocks, awaits approval, or reaches the step limit.
- `send_agent_message`: records role-to-role handoff.
- `agent_status`: summarizes phase, approval state, role state, subtasks, latest tools, evidence, and blockers.
- `finish_agent_workflow`: closes only after `AcceptanceReviewer` acceptance or an honest blocked/cancelled state.

## `create_pdf`

`create_pdf` creates a real PDF artifact from Markdown and validates the resulting file. Existing `path`, `markdown`, and `markdown_lines` inputs remain compatible. v0.3.3 adds `title`, `author`, `page_size`, `font_path`, and `render_preview`. Chinese text uses `DEEPSEEKCODE_PDF_FONT` when set, then Windows CJK font fallbacks. Explicit PDF requests must not be completed with only DOCX or Markdown.

## Project Process Tools

- `launch_project`: starts long-running services and persists `pid`, `cwd`, `command`, `port`, `url`, `runId`, and status in the state DB.
- `list_project_processes`: lists persisted and in-memory services.
- `stop_project_process`: stops `latest`, a PID/id, or `all` launched services and verifies the port is released when possible.
- `terminal_reset`: sends the Windows terminal recovery sequence without exiting the TUI.

## Remote Delivery Plan

Remote channels should display concise progress and completion:

| Artifact | Delivery |
| --- | --- |
| HTML/UI | screenshot and entry summary |
| PDF | real `.pdf` file, validation evidence, optional preview image |
| DOCX/PPTX/XLSX | previewable file, optional first-page/slide image |
| Markdown/text | short chat summary, file only when requested |
| Image/media | direct image/file |
| Multi-file project | manifest, entry, startup command, verification summary, key preview |

The model may suggest important outputs, but runtime decides delivery from real files.

## Status Values

Use these public status labels in docs and UI:

- `verified`: tested in real runs
- `partial`: implemented but still has known gaps
- `experimental`: usable for testing, not yet mature
- `reserved`: planned or compatibility placeholder

Avoid claiming that experimental remote, MCP, or multi-agent flows are production-complete.
