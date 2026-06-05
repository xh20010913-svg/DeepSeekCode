# DeepSeekCode Development Guide

This document is the developer manual for the public release tree. It explains how the runtime is organized, how new features should be added, and how to validate changes without polluting the project or test directories.

## Principles

- Keep the main path native-tool-first: provider requests must use DeepSeek `tools` / `tool_calls`, then local tools return `tool_result` messages.
- Do not reintroduce model-emitted ActionEnvelope JSON as the public planning protocol. Internal JSON/Zod/state payloads are fine.
- Do not classify user intent with hard-coded task keywords. The model chooses tools; the runtime enforces project bounds, permissions, validation, artifact typing, and delivery policy.
- Keep TUI and remote replies readable. Raw JSON, internal ids, long logs, prompt audits, and login state belong in trace/state files.
- Test real user scenarios in an external workspace such as `D:\code\DeepSeekTest`.
- Release only from `.release`.

## Source Layout

```text
src/cli/                 CLI entry, config bootstrap, TUI/headless/remote mode selection
src/components/          Ink TUI panels, pickers, transcript, status and gates
src/commands/            Slash command parsing and command handlers
src/query/               QueryEngine, prompt construction, turn classification
src/protocol/            Provider-facing action/tool schemas and internal requests
src/tools/               Local tool registry and executor
src/services/            Approval, agents, cache, hooks, memory, MCP, plugins, sessions, skills
src/remote/              WeCom and WeChat OpenClaw channels, rendering, approvals, delivery
src/state/               SQLite state store
src/skills/              Skill discovery and installation helpers
website/                 Static product documentation site
assets/                  Logo and README/website screenshots
scripts/                 Build and test helper scripts that must be present in release
```

The release layout is DeepSeekCode-oriented. It should not mirror Claude Code or any upstream project directory structure unless a file is genuinely needed by the runtime.

## Runtime Chain

```text
user input / remote message / slash command
  -> QueryEngine
  -> memory recall and context planning
  -> stable prompt + dynamic context + tool/skill schema
  -> DeepSeek native tool_calls
  -> local typed tool execution
  -> tool_result summaries persisted to state
  -> next provider call or final answer
```

Durable state is written through `StateStore`:

- `runs`: user tasks and chat turns.
- `events`: status, diagnostics, tool lifecycle, approvals, remote messages, and agent workflow events.
- `actions`: local tool execution records.
- `artifacts`: produced files and delivery metadata.
- `tasks` / `jobs`: long-running work, dependencies, and partial worker state.
- `checkpoints`: compact resumable state.
- `usage_snapshots`: token, cache, and cost accounting.
- `approval_gates` / `validation_gates`: decisions and runtime verification.

## Native Tools

Provider-facing tools are built from the local registry. Every tool needs:

- stable name and description;
- Zod input schema;
- permission mode;
- runtime implementation returning an action result;
- concise result summary suitable for prompt replay.

Important groups:

| Group | Examples |
| --- | --- |
| Files | `read_file`, `write_file`, `append_file`, `apply_patch`, `list_files`, `grep_files`, `glob_files` |
| Shell/browser | `run_command`, `browser_session_start`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot` |
| Office/artifacts | `create_docx`, `create_pptx`, `create_pdf`, `validate_artifact` |
| Skills/MCP | `search_skills`, `invoke_skill`, `mcp_call` |
| Memory | `tdai_memory_search`, `tdai_conversation_search` |
| Multi-agent | `start_agent_workflow`, `send_agent_message`, `agent_status`, `finish_agent_workflow` |

If a provider rejects native tools or a schema, fail clearly. Do not silently fall back to old JSON planning.

## Permissions

Permissions are runtime decisions:

- Shell is off by default unless enabled by CLI, startup selector, profile, or remote session grant.
- Browser, MCP, SSH, and plan/user gates use the same approval service pattern.
- `ApprovalService` persists gates to SQLite.
- TUI displays a picker.
- WeCom uses template cards where available.
- Personal WeChat uses numeric replies: `1` allow once, `2` allow session, `3` reject, `4` stop.

Adding a permissioned tool requires both local enforcement and user-facing rendering. Never rely on prompt wording alone.

## Skills And Plugins

Skills are discovered from project, user, plugin cache, and compatibility `.claude` locations. Installation writes into `.deepseekcode`.

Development rules:

- Accept local paths, GitHub URLs, Git URLs, and `file://` Git sources.
- Validate manifest, path traversal, BOM, duplicate names, and source subpaths.
- Multiple `SKILL.md` files in a repo can be batch-installed.
- `search_skills` and `invoke_skill` are native tools, so the model can auto-call skills by semantic match.
- `disable-model-invocation: true` excludes a skill from automatic candidates but keeps manual invocation.

Plugins can contribute commands, hooks, skills, and MCP configuration. Plugin behavior should remain scoped to the project/user install location.

## MCP And Hooks

MCP currently uses a unified `mcp_call` tool. Direct per-tool schema expansion can be added when server metadata is stable, small, and safe to expose.

Hooks run around local tool execution:

- PreToolUse can allow, ask, or block.
- PostToolUse records summaries and side effects.
- Hook failures are events, not task-ending failures, unless the hook explicitly blocks.

MCP and hook results must be summarized before they enter prompt replay.

## Multi-Agent Workflow

`AgentWorkflowService` is a project-scoped orchestration layer:

```text
Supervisor
  -> role specs
  -> shared blackboard messages
  -> role work records
  -> reviewer role
  -> final summary, artifacts, issues
```

Role specs include name, responsibility, allowed tools, preloaded skills, acceptance rules, and notes. If the user provides roles, preserve them and enrich the specs. If the user does not, the main model designs project-specific roles and adds a reviewer/acceptance role.

This is structured orchestration, not fully independent background model processes yet. Keep role messages persisted, summarized, and scoped to the current run.

## Async `/ask`

`/ask <question>` answers read-only side questions while a long task is running.

Allowed context:

- current run snapshot;
- recent events;
- tasks and blockers;
- usage totals;
- artifact list;
- selected file snippets when needed.

Disallowed behavior:

- writing files;
- running shell;
- browser automation;
- MCP write calls;
- mutating the active run objective.

Task-changing requests during an active run should be queued, rejected with a clear status, or require an explicit stop/continue decision.

## Remote Channels

Remote channels reuse the same QueryEngine, permissions, state, skills, and MCP surfaces. They do not create a second agent implementation.

Supported adapters:

- `wecom`: Enterprise WeChat intelligent robot via `@wecom/aibot-node-sdk`.
- `wechat-openclaw`: personal WeChat QR login and long polling via `@tencent-weixin/openclaw-weixin@2.4.4`.

Responsibilities:

- bind chat/account/project scopes;
- enforce allowed users, groups, and project roots;
- save inbound files to `.deepseekcode/remote/.../inbox`;
- render concise progress;
- route approvals to `ApprovalService`;
- deliver artifacts through `RemoteDeliveryPlan`;
- publish status through `RunEventBus` / `SessionHub`.

Remote chat should not output terminal logs. It should show phase, plan/todo counts, recent tool, blockers, token/cost, and final artifact summary.

## Artifact Delivery

The runtime classifies real files, not prompt keywords.

| Artifact | Delivery |
| --- | --- |
| HTML/HTM | Browser screenshot image when available; short entry-file summary. |
| DOCX/PPTX/XLSX | Send original file; optional preview if local conversion exists. |
| PDF | Send PDF; optional first-page images. |
| PNG/JPG/WebP | Send image. |
| MD/TXT | Send concise chat summary; file only on request. |
| Multi-file project | Send summary, entry file, screenshot, manifest; do not flood remote chat. |

The model may suggest important files, but `RemoteDeliveryPlan` decides what is safe and readable.

## Memory, Context, And Cache

DeepSeekCode vendors TencentDB-Agent-Memory as a local MIT runtime:

- before provider call: recall project/user memories;
- after successful turn: capture and extract memory;
- tools: `tdai_memory_search`, `tdai_conversation_search`;
- default store: local SQLite;
- TCVDB/embedding: optional enhancement.

Context should stay layered:

1. stable runtime prompt;
2. tool schema;
3. memory recall;
4. recent conversation;
5. rolling summary;
6. compact tool result summaries;
7. runtime run state.

Keep stable blocks deterministic to improve DeepSeek context caching.

## Testing

Base checks:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

Real scenarios belong outside `.release`:

```cmd
deepseekcode --project D:\code\DeepSeekTest --model deepseek-v4-flash
deepseekcode --wechat --project D:\code\DeepSeekTest --model deepseek-v4-flash
```

Recommended coverage:

- large website with docs, HTML entry, and screenshot;
- DOCX/PPTX generation;
- failure and self-repair;
- multi-agent workflow with reviewer;
- `/ask` during long task;
- WeChat approval and artifact delivery;
- skill install/search/auto-invoke;
- MCP mock call and permission failure.

## Release Process

1. Work only in `.release`.
2. Update `package.json` and `package-lock.json` version together.
3. Update README, Guide, CLI reference, architecture, development, API, and website when behavior changes.
4. Run typecheck, build, and pack dry-run.
5. Put real test outputs and npm tarballs in `D:\code\DeepSeekTest`, not in git.
6. Commit only release files.
7. Push with local git.

Release exclusions: `.env`, prompt audits, test outputs, runtime databases, login state, generated reports, node_modules, and scratch handoff notes.
