# DeepSeekCode Architecture

DeepSeekCode v0.2.8 is a local TypeScript agent runtime built around DeepSeek native tool calls, durable project state, permissioned local tools, memory, remote channels, and extension surfaces.

## Runtime Loop

```text
src/cli/main.tsx
  -> bootstrap config
  -> TUI, headless prompt, WeCom, or WeChat OpenClaw mode
  -> QueryEngine
  -> DeepSeekClient
  -> native tool_calls
  -> local baseTools registry
  -> tool_result summaries
  -> SQLite state + session transcript
  -> TUI/remote final rendering
```

The model-facing planning path is native tool calling. Internal `ActionRequest` / `ActionResult` objects still exist after native tool calls are converted and validated, but the provider prompt no longer asks the model to emit a large ActionEnvelope JSON plan.

## Main Modules

| Area | Path | Responsibility |
| --- | --- | --- |
| CLI | `src/cli/main.tsx` | Parse flags, configure runtime, run TUI/headless/remote modes. |
| Config | `src/bootstrap/config.ts` | Load provider, project path, data dir, language, model, permissions. |
| Orchestration | `src/query/QueryEngine.ts` | Build context, call provider, execute tools, record usage/events. |
| Provider | `src/services/deepseek/` | DeepSeek-compatible client, native tools schema, prompt audit, retry/errors. |
| Tools | `src/tools/registry.ts` | Real provider-facing local tool registry. |
| Tool execution | `src/tools/executor.ts` | Validate args, apply permissions, execute, emit hooks/events. |
| State | `src/state/sqlite.ts` | Runs, actions, artifacts, events, gates, usage, checkpoints. |
| Sessions | `src/services/session/` | Transcripts, resume, recent context, compact tool summaries, session hub. |
| Run event bus | `src/services/runs/runEventBus.ts` | Publishes persisted events to TUI/remote observers. |
| Long-term memory | `src/services/memory/` + `src/vendor/tencentdb-agent-memory/` | TencentDB-Agent-Memory runtime integration. |
| Skills | `src/skills/`, `src/services/skills/` | `SKILL.md` discovery, install, validation, search, invocation. |
| Plugins | `src/plugins/`, `src/services/plugins/` | Plugin manifest loading, install/update/uninstall, commands, hooks, skills. |
| MCP | `src/services/mcp/` | MCP configuration and unified `mcp_call` execution. |
| Hooks | `src/hooks/`, `src/services/hooks/` | PreToolUse/PostToolUse and related hook execution. |
| Multi-agent | `src/services/agents/` | Role specs, blackboard messages, reviewer state, workflow checkpoints. |
| Remote | `src/remote/` | WeCom / WeChat OpenClaw bridges, policies, approvals, reply rendering, delivery. |
| UI | `src/components/` | Ink TUI panels, transcript, selectors, gates, status. |
| Website | `website/` | Static public manual site. |

The release tree keeps only connected runtime paths and user-facing documentation. It is not a mirror of Claude Code source layout.

## Provider And Tools

`DeepSeekClient` sends:

- stable system/runtime messages;
- dynamic context;
- `tools` converted from the local registry;
- `tool_choice: "auto"`.

Expected provider response:

```text
assistant message
  -> tool_calls[]
  -> local validation/execution
  -> tool result messages
  -> next provider request
```

Failure behavior:

| Failure | Behavior |
| --- | --- |
| Model or gateway lacks tool calling | Clear error; no JSON fallback. |
| Provider rejects schema | Clear error with provider context. |
| Tool args fail local schema | Validation feedback returned to model. |
| Network / 429 / retryable 5xx | Limited retry. |
| 400 / 401 / 403 / 404 | No retry unless marked retryable. |

## Permission Architecture

Permission gates are centralized:

```text
tool request
  -> permission policy
  -> ApprovalService gate
  -> TUI / WeCom / WeChat decision surface
  -> approved tool execution or rejected tool_result
```

Shell, browser, MCP, SSH, and user/plan gates follow the same pattern. The runtime does not infer permission from user prompt keywords.

## Context And Cache

Context is layered for cache stability:

| Layer | Purpose |
| --- | --- |
| Stable runtime prompt | Tool-use and safety policy, kept deterministic. |
| Tool schema | Native function definitions. |
| Memory recall | Relevant TencentDB-Agent-Memory facts. |
| Repository map | Bounded project orientation. |
| Recent conversation | Latest useful turns. |
| Rolling summary | Older goals, constraints, paths, failures, remaining work. |
| Tool result summary | Compact stdout/diff/error/artifact summaries. |
| Runtime run state | Tasks, gates, artifacts, usage, checkpoints. |

Usage snapshots record input, output, cache hit/miss, and estimated cost when available.

## Memory

TencentDB-Agent-Memory is vendored as an MIT runtime:

```text
before prompt build
  -> recall memory
  -> inject bounded memory context
  -> native tool loop
  -> final answer
  -> capture/extract memory
```

Default behavior is local SQLite. Embeddings and Tencent Cloud VectorDB are optional. Without those settings, the product presents itself as local memory rather than full semantic vector memory.

## Remote Control

Remote channels share the main runtime:

```text
WeCom WS or WeChat OpenClaw message
  -> RemoteAccessPolicy
  -> RemoteProjectBinding
  -> QueryEngine
  -> normal permission/tool/memory/skill path
  -> RemoteReplyRenderer
  -> concise progress, approvals, final summary, artifact delivery
```

Adapters:

- `wecom`: Enterprise WeChat intelligent bot via `@wecom/aibot-node-sdk`.
- `wechat-openclaw`: personal WeChat via Tencent `@tencent-weixin/openclaw-weixin@2.4.4`.

Session scope includes channel, account/chat id, and project path. This prevents different projects or chats from sharing raw transcript state while allowing the same project runtime to publish status to TUI and remote surfaces.

Remote replies intentionally avoid console logs. They should show current phase, plan/todo state, recent tool, blockers, token/cost, and useful artifact summaries.

## Artifact Delivery

`RemoteDeliveryPlan` classifies produced files:

| Artifact | Remote behavior |
| --- | --- |
| HTML/HTM | Browser screenshot when available, plus entry path summary. |
| DOCX/PPTX/XLSX | Send original file; optional PDF/image preview when conversion exists. |
| PDF | Send PDF; optional first-page preview. |
| Image | Send image. |
| Markdown/text | Send short summary; file only on request. |
| Multi-file project | Send summary, entry file, screenshot, manifest-style list. |

The model can suggest important outputs, but the runtime decides delivery based on real artifacts.

## Skills, Plugins, MCP, Hooks

Skills and plugins are extension surfaces:

- project/user/plugin skill discovery;
- `.claude` compatibility discovery;
- `.deepseekcode` install targets;
- local path, GitHub URL, Git URL, and `file://` Git installs;
- manifest/BOM/path traversal checks;
- automatic skill candidates through `search_skills` and `invoke_skill`.

MCP is currently exposed through `mcp_call`. Future work can expand individual MCP tools directly into native function schemas.

Hooks run around local tools. PreToolUse may block or ask. PostToolUse records summaries. Hook errors are events unless the hook explicitly blocks.

## Multi-Agent Workflow

v0.2.8 includes a project-scoped workflow service:

```text
main agent
  -> start_agent_workflow(goal, roles)
  -> role specs persisted
  -> shared blackboard messages
  -> reviewer role records acceptance gaps
  -> finish_agent_workflow(summary, artifacts, issues)
```

Users may define roles in natural language. If they do not, the main model designs role specs and adds a reviewer. This is still experimental: it provides structured role state and messages, not a fully independent background model worker pool.

## Async Side Questions

`/ask` gives a read-only answer while a run continues:

```text
/ask
  -> current run snapshot
  -> recent events and artifacts
  -> provider answer without write/shell/browser tools
  -> side-channel answer
```

This is designed for questions like "what is it doing now?" or "what files has it changed?" without interrupting the active task.

## Capability Status

| Capability | Status |
| --- | --- |
| Native tool calling | verified |
| File tools | verified |
| Shell tools | permissioned |
| Browser CDP | partial |
| MCP | partial |
| Hooks | verified |
| Skills/plugins | verified |
| DOCX/PPTX | partial |
| TencentDB-Agent-Memory | verified |
| WeCom remote control | experimental / testable |
| Personal WeChat OpenClaw | experimental / testable |
| Remote artifact preview | partial |
| Multi-agent workflow | experimental / testable |
| Async `/ask` | verified |
| Personal WeChat hook | reserved |
| PDF | experimental |
| Long-running worker pool | partial |
| `computer_use` | reserved |

## Release Boundary

Published files are runtime source, public assets, website, and user manuals. The release excludes prompt audits, test artifacts, local `.env`, runtime databases, generated reports, login state, node_modules, handoff notes, and unconnected upstream source mirrors.
