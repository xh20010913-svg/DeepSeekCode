# DeepSeekCode Architecture

Version: `v0.3.4`

DeepSeekCode is a DeepSeek-native local agent runtime. The model is responsible for understanding the user's goal and choosing tools. The runtime is responsible for tool schemas, permission gates, platform safety, project state, verification, artifact delivery, remote channels, and recovery.

The v0.3 line moves the project from "can call tools" toward a generic execution loop: create a task contract, execute with native tool calls, verify real outputs, feed failures back to the model, and retry with a better strategy.

## Runtime Chain

```text
TUI / CLI / WeChat / WeCom
  -> command router or QueryEngine
  -> stable prompt blocks + project/session context
  -> DeepSeek provider with tools[]
  -> native tool_calls
  -> Zod validation + local tool registry
  -> hooks + permission gate + Windows/platform preflight
  -> tool execution
  -> compact tool_result
  -> verify_task / repair / next provider turn
  -> final answer + artifact delivery
```

Provider-facing execution does not rely on model-emitted `ActionEnvelope JSON`. Internal JSON, Zod schemas, and SQLite records remain for validation, configuration, state, run events, and reports.

## Core Subsystems

| Subsystem | Responsibility |
| --- | --- |
| Agent Kernel | Normalizes run lifecycle into intent, contract, plan, execution, evidence, verification, repair/final events; records spans, prompt budget plans, and evidence so chat, tools, workflows, remote, and UI observe the same truth. |
| QueryEngine | Streams UI and dispatches user input while provider calls, tool reports, evidence, budget records, and verification events are routed through Kernel services. |
| Prompt Budget Governor | Splits prompts into stable, project, context, feedback, and request blocks; applies deterministic ordering, hashes, token/char budgets, and dropped-block diagnostics before provider calls. |
| Context capsule | Compresses long sessions into user goals, completed facts, blockers, key artifacts, next steps, and recent tool summaries. |
| Tool registry | Exposes file, shell, browser, real PDF, Office, skills, MCP, project process, verification, and workflow tools. |
| Capability registry | Describes tool purpose, risk, long-running behavior, remote safety, and expected verification so events and UI do not guess from tool names. |
| Task contract | Stores model-authored goals, expected artifacts, verifiable behavior, user constraints, and acceptance criteria. |
| Verification | `verify_task` selects checks from real artifacts and project shape. HTML is one validator, not the center of the system. |
| Permission service | Gates shell, browser, MCP, SSH, and risky actions across TUI and remote channels. |
| State store | Persists sessions, runs, events, tasks, artifacts, approvals, usage, checkpoints, and remote bindings. |
| Memory | Integrates TencentDB-Agent-Memory style recall/capture with local SQLite state. |
| Skills/plugins | Installs, validates, searches, and invokes local or Git-backed skills/plugins. |
| MCP | Provides unified `mcp_call`; native per-tool schema expansion is an extension path. |
| Remote channels | WeCom and personal WeChat OpenClaw share QueryEngine, state, permissions, and delivery planning. |
| Agent workflow | Plan gate + Planner role plan + dynamic middle roles + workflow-local skills + subtask scheduler + AcceptanceReviewer evidence gate. |
| Agent panel | Bundled Pixel Agents read-only observer with local HTTP/WebSocket/SSE snapshots, process/cache/offline state, tokenized share or Quick Tunnel links, and JSONL trace output. |
| Artifact delivery | Sends readable previews by artifact type instead of flooding remote chat with source files. |

## Generic Completion

`verify_task` is the generic completion gate. It checks the model-authored task contract against the actual workspace:

- Code projects: package manifests, install/build/test scripts, launch smoke checks, startup errors, and dependency failures.
- CLI/scripts: command availability, exit codes, outputs, and produced files.
- Browser-visible outputs: page load, screenshots, blank page checks, console errors, and missing resources.
- PDF: `%PDF-` header, readable structure, page count through `pdf-lib`, and optional preview rendering when Poppler is available.
- Office/spreadsheets: package structure, file existence, renderability or previewability where available.
- Markdown/reports: non-empty content, expected sections, data/citation artifacts, and requested format.
- Data tasks: CSV/TSV/JSON/XLSX presence, parseability, rows, and report consistency.
- Media: file existence, type, size, and preview path.
- MCP/plugins/skills: installation, discovery, callable status, result shape, and failure feedback.

Failures are returned as compact tool results. The model must repair the concrete issue and run verification again until the budget is exhausted or the task is honestly blocked.

## Windows Reliability

`src/tools/commandPreflight.ts` keeps task intent out of platform checks. It detects command/runtime problems such as:

- POSIX commands that do not work in Windows PowerShell, for example `mkdir -p`, `rm -rf`, `cat`, and bash-only pipes.
- `node-gyp`, Visual Studio Build Tools, Node version, native dependency, and dependency install failures.
- Port conflicts, timeouts, and command-not-found cases.

The runtime returns actionable guidance: use PowerShell-safe commands, switch to pure JavaScript dependencies, reduce dependency complexity, use file/runtime tools, or ask the user to install a required system component.

## Multi-Agent Workflow

Multi-agent mode is a project-scoped workflow, not a chat gimmick. It starts with a Plan Gate: `Planner` creates a reviewable role plan, subtask graph, expected artifacts, verification plan, risk notes, and workflow-local role skills. The workflow then waits for execute, revise, regenerate, or cancel. `Planner` and `AcceptanceReviewer` are the only fixed roles; middle execution roles are generated from the task contract, output types, required tools, dependencies, and verification risk. Each role has:

- responsibility and context scope
- allowed tools
- generated workflow-local skill
- assigned subtasks and completed subtasks
- transcript snippets and tool-result summary
- checkpoint
- status, last message, and blocker
- acceptance criteria
- risk checks and handoff format

The scheduler chooses the next runnable subtask by dependency and status, not by a fixed role sequence. `run_agent_workflow_step` and `drain_agent_workflow` run role-local provider/tool loops while the supervisor layer receives only summaries, artifacts, blockers, and validation conclusions. `AcceptanceReviewer` acceptance must refer back to the task contract, subtask evidence, and the relevant validators.

Required artifact roles have a runtime safety pass. If the contract requires PDF, MCP, or Office outputs, the fallback planner preserves or injects a role with the matching tools/skills before execution so a complex website/game plan cannot silently drop document or integration deliverables.

When a new workflow starts, `AgentDashboardServer` serves the bundled Pixel Agents panel and writes `agent-trace.jsonl`. Continue, repair, and refine requests reuse the same run page instead of opening another browser tab. The panel is built from durable run/task/event/artifact state, not terminal scraping. It presents the plan preview, stage, dynamic roles, subtask graph, dependencies, evidence, blockers, spans, artifacts, process/cache/budget summary, offline state, and a responsive phone layout for WeChat viewing. The overlay is a single template module (`agentDashboardOverlay.ts`) so old V1-V5 inline layouts cannot accidentally take over. Remote channels can share the same view through `DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL`; `/agents dashboard tunnel` can create a temporary Cloudflare Quick Tunnel for one tokenized run page. Without a secure public URL the link remains local-only. The panel is read-only and never approves tools or executes commands.

## Remote Runtime

TUI, WeChat, and WeCom are different frontends on the same runtime. Remote channels do not run a separate agent brain. They bind a project, send messages into QueryEngine, receive progress events, approve permissions, and receive a delivery plan.

Remote delivery is runtime-generated from real files:

- HTML/UI: screenshot plus entry summary.
- PDF: real `.pdf` file plus validation evidence; preview image when Poppler conversion is available.
- Office: previewable file, and a preview image when conversion is available.
- Markdown/text: short chat summary, file only when requested.
- Multi-file project: entry, manifest, startup command, verification summary, and key preview.

## Cache And Context

DeepSeek cache hit rate depends heavily on stable prefixes. DeepSeekCode keeps stable blocks first:

1. system rules
2. tool schemas in stable order
3. skills/MCP index summaries
4. project rules
5. rolling run state
6. recent user/model turns
7. compact tool-result summaries

Long stdout, diffs, logs, and raw artifacts are stored as events or files; only compact summaries are replayed.

All provider calls should go through the prompt budget governor. The governor keeps user requests last, stable prefixes first, and records `budgetPlanId`, `stableHash`, `dynamicHash`, dynamic character share, dropped blocks, compact pressure, and cache hit/miss usage when the provider reports it. Long conversations use the five-part context capsule instead of replaying full transcripts. `/cache report`, `/cache trend`, and Pixel snapshots expose the same budget/cache evidence so cost regressions are visible.

## Capability Status

| Capability | Status |
| --- | --- |
| Native DeepSeek tool calling | Verified |
| Local file tools and shell gate | Verified |
| Generic `verify_task` | Verified core, expanding validators |
| Windows command diagnostics | Verified core, expanding command patterns |
| PDF artifacts | Verified core, CJK font discovery and structure validation |
| Office/spreadsheet artifacts | Partial |
| Skills/plugins install and invoke | Partial |
| MCP unified call | Experimental |
| Multi-agent workflow | Experimental, plan-gated dynamic roles wired |
| WeCom remote | Experimental |
| Personal WeChat OpenClaw remote | Experimental |
| Computer-use style GUI control | Reserved |

## Extension Rules

- Do not add prompt-keyword completion hacks.
- Add new task classes by adding validators and delivery policies, not by hardcoding user wording.
- Keep tool results compact and actionable.
- Keep permission, path safety, and platform preflight in runtime code.
- Keep model intent and repair strategy in model turns.
