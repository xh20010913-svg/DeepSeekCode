# DeepSeekCode Architecture

Version: `v0.3.1`

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
| QueryEngine | Builds messages, calls the provider, executes native tool calls, records usage/events, schedules verification, and feeds failures back. |
| Tool registry | Exposes file, shell, browser, Office, skills, MCP, verification, and workflow tools. |
| Task contract | Stores model-authored goals, expected artifacts, verifiable behavior, user constraints, and acceptance criteria. |
| Verification | `verify_task` selects checks from real artifacts and project shape. HTML is one validator, not the center of the system. |
| Permission service | Gates shell, browser, MCP, SSH, and risky actions across TUI and remote channels. |
| State store | Persists sessions, runs, events, tasks, artifacts, approvals, usage, checkpoints, and remote bindings. |
| Memory | Integrates TencentDB-Agent-Memory style recall/capture with local SQLite state. |
| Skills/plugins | Installs, validates, searches, and invokes local or Git-backed skills/plugins. |
| MCP | Provides unified `mcp_call`; native per-tool schema expansion is an extension path. |
| Remote channels | WeCom and personal WeChat OpenClaw share QueryEngine, state, permissions, and delivery planning. |
| Agent workflow | Supervisor + role specs + shared blackboard + Tester/Reviewer acceptance. |
| Agent panel | Bundled Pixel Agents read-only observer with local HTTP/SSE snapshots, tokenized share links, and JSONL trace output. |
| Artifact delivery | Sends readable previews by artifact type instead of flooding remote chat with source files. |

## Generic Completion

`verify_task` is the generic completion gate. It checks the model-authored task contract against the actual workspace:

- Code projects: package manifests, install/build/test scripts, launch smoke checks, startup errors, and dependency failures.
- CLI/scripts: command availability, exit codes, outputs, and produced files.
- Browser-visible outputs: page load, screenshots, blank page checks, console errors, and missing resources.
- Office/PDF/spreadsheets: package structure, file existence, renderability or previewability where available.
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

Multi-agent mode is a project-scoped workflow, not a chat gimmick. The main model can create roles, preserve user-specified roles, or generate Planner/Builder/Tester/Reviewer roles. Each role has:

- responsibility and task slice
- allowed tools and disallowed tools
- suggested skills
- output requirements
- acceptance criteria

The workflow writes role messages to a shared blackboard and exposes `agent_status` for TUI/remote display. Reviewer acceptance must refer back to the task contract and the relevant validators.

When a workflow starts, `AgentDashboardServer` serves the bundled Pixel Agents panel and writes `agent-trace.jsonl`. The panel is built from durable run/task/event/artifact state, not terminal scraping. Remote channels can share the same view through `DEEPSEEKCODE_AGENT_PANEL_PUBLIC_BASE_URL`; without a secure tunnel the link remains local-only. The panel is read-only and never approves tools or executes commands.

## Remote Runtime

TUI, WeChat, and WeCom are different frontends on the same runtime. Remote channels do not run a separate agent brain. They bind a project, send messages into QueryEngine, receive progress events, approve permissions, and receive a delivery plan.

Remote delivery is runtime-generated from real files:

- HTML/UI: screenshot plus entry summary.
- Office/PDF: previewable file, and a preview image when conversion is available.
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

## Capability Status

| Capability | Status |
| --- | --- |
| Native DeepSeek tool calling | Verified |
| Local file tools and shell gate | Verified |
| Generic `verify_task` | Partial, active v0.3 work |
| Windows command diagnostics | Partial, active v0.3 work |
| Office/PDF/spreadsheet artifacts | Partial |
| Skills/plugins install and invoke | Partial |
| MCP unified call | Experimental |
| Multi-agent workflow | Experimental |
| WeCom remote | Experimental |
| Personal WeChat OpenClaw remote | Experimental |
| Computer-use style GUI control | Reserved |

## Extension Rules

- Do not add prompt-keyword completion hacks.
- Add new task classes by adding validators and delivery policies, not by hardcoding user wording.
- Keep tool results compact and actionable.
- Keep permission, path safety, and platform preflight in runtime code.
- Keep model intent and repair strategy in model turns.
