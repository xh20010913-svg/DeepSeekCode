# DeepSeekCode Development Guide

This document describes how DeepSeekCode is built and how new runtime features should be developed. It is intentionally focused on the public release tree, not on historical scratch docs.

## Development Principles

- Read the current runtime path before changing code. Prefer existing services, registries, and state tables over new isolated subsystems.
- Use DeepSeek native function calling for local work. Do not reintroduce model-emitted ActionEnvelope JSON as a public planning protocol.
- Keep user-facing remote and TUI output concise. Internal IDs, raw JSON, prompt audit files, and long logs belong in state/trace files, not in chat replies.
- Runtime decisions should be generic. Do not detect “website”, “PPT”, or similar user keywords to force tools. Let the model request tools; let the runtime enforce permissions, artifact validation, and delivery policy.
- Test with realistic user tasks in an external workspace such as `D:\code\DeepSeekTest`. Do not commit test artifacts, `.env`, prompt audits, or generated reports.

## Source Layout

```text
src/cli/                 CLI entry and process mode selection
src/components/          Ink TUI components
src/commands/            Slash commands
src/query/               QueryEngine and prompt construction
src/protocol/            Provider/tool schemas and typed action requests
src/tools/               Local tool registry and executor
src/services/            Runtime services: approval, agents, cache, memory, MCP, skills, sessions
src/remote/              WeCom / WeChat remote channels and remote rendering
src/state/               SQLite state store
src/skills/              Skill discovery helpers
website/                 Static documentation site
assets/                  Public README and website assets
```

## Runtime Chain

The main local chain is:

```text
user input
  -> QueryEngine
  -> memory recall and request classification
  -> stable system prompt + context bundle + skill/tool state
  -> DeepSeek provider native tool calls
  -> local typed tools
  -> tool_result summaries persisted to session state
  -> next provider turn or final answer
```

Important state is persisted through `StateStore`:

- `runs`: one user task or chat turn.
- `events`: durable event log for status, diagnostics, tool lifecycle, approvals, remote messages, and agent workflow events.
- `actions` and `artifacts`: tool results and produced files.
- `tasks` and `jobs`: background and multi-agent work tracking.
- `checkpoints`: compact resumable state snapshots.
- `usage_snapshots`: token, cache, and cost accounting inputs.
- `approval_gates` and `validation_gates`: user decisions and runtime verification records.

## Native Tools

Tools are registered in `src/tools/registry.ts`. Each tool must have:

- a stable name and description;
- a Zod input schema;
- a permission mode;
- a runtime implementation that returns an `ActionResult`.

Provider-facing schema lives in `src/protocol/actions.ts`. Internal JSON and Zod validation remain valid because they validate tool arguments and state payloads. The removed pattern is public model planning through large ActionEnvelope JSON blocks.

## Permissions

Permission gates are enforced by the runtime, not by prompt keywords.

- Shell is off by default unless enabled by CLI flags, startup selector, profile, or remote session grant.
- Browser and MCP tools follow the same permission service pattern.
- `ApprovalService` writes gates to SQLite; TUI, WeCom, and personal WeChat decide those gates through their own UI surfaces.
- Personal WeChat uses a numeric menu: `1` allow once, `2` allow for session, `3` reject, `4` stop task.
- WeCom uses template cards where the SDK surface supports them.

## Multi-Agent Workflow

v0.2.7 introduces a project-scoped `AgentWorkflowService`.

Native tools:

- `start_agent_workflow`
- `send_agent_message`
- `agent_status`
- `finish_agent_workflow`

The workflow shape is:

```text
Supervisor
  -> role specs
  -> shared blackboard messages
  -> per-role tasks
  -> reviewer role
  -> final status and artifacts
```

`AgentRoleSpec` includes role name, responsibility, allowed tools, preloaded skills, acceptance rules, and optional notes. If the user provides roles, the model should preserve them and enrich their skills/rules. If the user does not provide roles, the model should design project-specific roles and always add a reviewer/acceptance role.

This is not fully unbounded agent-to-agent chat. The runtime records messages and checkpoints so the main agent can summarize and continue without mixing unrelated project history.

## Async Side Questions

Long tasks can now accept read-only side questions through:

```text
/ask <question>
```

Remote channels also support `/ask`. The side-channel service reads current run state, tasks, recent events, usage, and artifacts, then asks the provider for a concise answer. It is not allowed to write files, run shell, use browser, call MCP, or mutate the main run. Task-like requests should be queued or sent as normal tasks instead.

## Remote Channels

Remote channels reuse `QueryEngine`, `StateStore`, permissions, skills, and MCP. They do not run a separate agent implementation.

Supported channels:

- `wecom`: Enterprise WeChat intelligent robot through `@wecom/aibot-node-sdk`.
- `wechat-openclaw`: personal WeChat OpenClaw QR login and long polling through `@tencent-weixin/openclaw-weixin`.

Both channels:

- bind a chat to a project path;
- enforce allowlists and allowed project roots;
- save incoming attachments to `.deepseekcode/remote/.../inbox`;
- show concise progress;
- route permissions to ApprovalService;
- send artifact previews according to runtime classification.

`RunEventBus` publishes every persisted state event. `SessionHub` tracks latest project run and remote channel status so TUI and remote surfaces can converge on one project session instead of separate isolated views.

## Artifact Delivery

The runtime classifies actual files, not prompt keywords.

| Artifact | Delivery behavior |
| --- | --- |
| `.html` / `.htm` | Generate a browser screenshot and send image preview; do not send raw HTML unless explicitly requested later. |
| `.docx` / `.pptx` / `.xlsx` | Send file. Future work may add LibreOffice PDF/image previews. |
| `.pdf` | Send file; future work may render first pages as images. |
| `.png` / `.jpg` / `.webp` | Send image. |
| `.md` / `.txt` | Send concise chat summary; keep file local unless requested. |
| multi-file project | Send summary, entry file name, screenshot, and manifest-style list; do not flood WeChat with every source file. |

## Skills And MCP

Skills are discovered by `src/skills/discovery.ts` and invoked through `invoke_skill`.

MCP is currently routed through `mcp_call`, backed by `McpService`. Future work may expose each MCP tool as its own native tool schema when the server metadata is stable and small enough.

When adding or testing skills/MCP:

- validate manifest and path boundaries;
- avoid prompt logging secrets;
- ensure tool results are summarized before entering persistent session history;
- run both happy path and permission-denied path.

## Testing

Core checks:

```bash
npm.cmd run typecheck
npm.cmd run build
```

Realistic task tests belong outside the release tree:

```bash
deepseekcode --project D:\code\DeepSeekTest --model deepseek-v4-flash
deepseekcode --wechat --project D:\code\DeepSeekTest --model deepseek-v4-flash
```

Recommended scenarios:

- large web project with generated docs, HTML entry, and browser screenshot;
- DOCX project report;
- PPT course/defense deck;
- long task continued through multiple turns;
- multi-agent workflow with reviewer role;
- `/ask` side question while the main task is running;
- WeChat artifact preview and permission approval;
- skill install/search/invoke;
- MCP mock stdio/http call and permission failure.

## Release Rules

- Release from `.release` only.
- Do not commit `D:\code\DeepSeekTest`, `.env`, prompt audits, login state, node_modules, generated reports, or scratch docs.
- Update README, Guide, CLI reference, architecture, website guide, and capability matrix whenever behavior changes.
- Keep README as an operating manual, not a marketing essay.
