# DeepSeekCode Architecture

DeepSeekCode v0.2 is a terminal runtime built around native DeepSeek tool calls, local typed tools, durable state, and cache-aware context.

## Runtime Loop

```text
src/cli/main.tsx
  -> bootstrap config
  -> Workbench, headless prompt, WeCom, or WeChat OpenClaw remote channel
  -> QueryEngine
  -> DeepSeekClient
  -> native tool_calls
  -> baseTools registry
  -> tool_result summaries
  -> SQLite state + session transcript
```

The model-facing planning path is native tool calling only. Internal `ActionEnvelope` records still exist as a runtime batch container after native tool calls are converted and validated, but the provider prompt no longer asks the model to output an ActionEnvelope JSON object.

## Main Modules

| Area | Path | Responsibility |
| --- | --- | --- |
| CLI | `src/cli/main.tsx` | Parse flags, configure runtime, run TUI or headless prompts. |
| Config | `src/bootstrap/config.ts` | Load provider, project path, data dir, language, model, and permissions. |
| Orchestration | `src/query/QueryEngine.ts` | Classify turns, build context, request native tool calls, execute tools, record usage. |
| Provider | `src/services/deepseek/` | DeepSeek-compatible client, native tool schema conversion, prompt audit capture, retry/error handling. |
| Tools | `src/tools/registry.ts` | Real local tool registry exposed to native function calling. |
| Tool execution | `src/tools/executor.ts` | Validate tool arguments, apply permissions, execute tools, emit hooks/events. |
| State | `src/state/sqlite.ts` | Runs, tasks, actions, artifacts, events, gates, usage, and checkpoints. |
| Sessions | `src/services/session/` | JSONL transcripts, resume, recent conversation, compact tool summaries. |
| Long-term memory | `src/services/memory/` + `src/vendor/tencentdb-agent-memory/` | Vendored MIT TencentDB-Agent-Memory runtime, recall injection, turn capture, and memory search tools. |
| Skills | `src/skills/`, `src/services/skills/` | Built-in and installed `SKILL.md` discovery, validation, and forked skill runs. |
| Plugins | `src/plugins/`, `src/services/plugins/` | Plugin manifest loading, install/update/uninstall, commands, hooks, skills. |
| MCP | `src/services/mcp/` | MCP configuration and unified `mcp_call` execution. |
| Hooks | `src/hooks/`, `src/services/hooks/` | PreToolUse/PostToolUse and related hook execution. |
| UI | `src/components/` | Ink/React TUI panels, picker, transcript, permission and status views. |
| Remote channels | `src/remote/` | WeCom and WeChat OpenClaw bridges, access policy, project binding, concise reply rendering, and remote approval. |
| Website | `website/` | Static public manual site. |

The release tree intentionally removed unconnected upstream source-path adapters. The directory layout is DeepSeekCode-oriented rather than a mirror of another agent.

## Provider And Tool Calling

`DeepSeekClient.planActions` sends:

- messages built from stable runtime prompt and dynamic context
- `tools: toNativeFunctionTools(baseTools)`
- `tool_choice: "auto"`

The response must contain native `tool_calls` for local work. Tool calls are converted to internal `ActionRequest` objects and validated against Zod schemas before execution.

Provider failures are handled explicitly:

| Failure | Behavior |
| --- | --- |
| Unsupported tools/schema rejection | Clear error; no JSON fallback. |
| Invalid local arguments | Clear schema validation error. |
| Network/429/5xx | Limited retry. |
| 400/401/403/404 | No retry unless provider returns a retryable status. |

## Tool Surface

The real provider-facing tool surface is `baseTools`:

- file: `read_file`, `list_files`, `write_file`, `glob_files`, `grep_files`, `apply_patch`
- shell/remote: `run_command`, `ssh_run`, `ssh_read_file`, `ssh_write_file`
- browser: `browser_session_start`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot`
- planning/user gates: `TodoWrite`, `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion`
- extension: `invoke_skill`, `invoke_agent`, `mcp_call`
- long-term memory: `tdai_memory_search`, `tdai_conversation_search`
- artifacts: `create_docx`, `create_pptx`, `create_pdf`, `validate_artifact`
- reserved: `computer_use`

`/tools` reports supported, partial, experimental, and reserved status.

## Context And Cache

DeepSeekCode separates context into stable and dynamic layers:

| Layer | Purpose |
| --- | --- |
| Stable prompt | Runtime rules and tool-use policy. |
| Tool schema | Deterministic tool definitions for native tool calling. |
| Project memory | User/project facts from `.deepseekcode`. |
| TencentDB-Agent-Memory recall | L1/L3 long-term memories recalled before prompt planning and inserted as dynamic context. |
| Repository map | Bounded file map for orientation. |
| Recent conversation | Last useful user/assistant turns. |
| Rolling summary | Older goals, constraints, decisions, failures, and paths. |
| Tool result summary | Compact stdout/diff/error/artifact summaries. |
| Runtime run state | Recent runs, tasks, checkpoints, gates, artifacts, and remaining work. |

Usage snapshots record input/output/cache hit/cache miss tokens when the provider returns them. `/cache`, `/usage`, and `/cost` expose this state.

## Long-Term Memory

DeepSeekCode vendors the MIT-licensed TencentDB-Agent-Memory runtime instead of installing it as an upstream OpenClaw plugin. The adapter gives the Tencent plugin a small runtime API, then wires its hooks and tools into DeepSeekCode:

```text
before user turn
  -> TDAI before_prompt_build recall
  -> DeepSeekCode dynamic context block
  -> native DeepSeek tool call planning
  -> local tools and tool_result messages
  -> final assistant response
  -> TDAI agent_end capture/extraction
```

Default behavior is local-first:

- Data is written under `<data-dir>/tdai/memory-tdai/`.
- L0 conversation capture and L1 extraction are enabled when the provider is configured.
- Local SQLite is the default store.
- Embeddings and Tencent Cloud VectorDB require explicit environment configuration.
- `/memory status`, `/memory search`, and `/memory conversation` expose the runtime to users.

The memory layer is a real supported capability, but semantic vector quality depends on embedding/TCVDB configuration. Without those settings, documentation and `/doctor` present it as local SQLite memory rather than full vector memory.

## Long-Running Work

SQLite stores:

- runs and statuses
- action records
- artifact records
- event trace
- tasks and dependencies
- approval and validation gates
- usage snapshots
- checkpoints

`--continue` and `--resume <session-id>` restore transcript state. `/pause`, `/run-resume`, and `/cancel` update durable run state. `/multi provider <task>` writes Planner -> Builder -> Tester -> Reviewer role progress into the same state store.

The current worker system is partial: task records, checkpoints, resume/cancel/retry surfaces, and multi-agent scheduling exist, while a fully independent background worker pool remains an active development area.

## Remote Control

Remote channels do not create a separate agent runtime. The WeCom adapter receives text, file/image/video messages, and template-card events. The WeChat OpenClaw adapter receives personal WeChat messages through OpenClaw QR login and long polling. Both call the same QueryEngine used by TUI and headless mode. Session scope is isolated by `channel + accountId + chatId + projectPath`, while tools still execute inside the bound project path.

```text
WeCom WS message or WeChat OpenClaw getupdates message
  -> RemoteAccessPolicy
  -> RemoteProjectBinding
  -> QueryEngine.submit()
  -> normal permission gates and tool execution
  -> RemoteReplyRenderer concise progress/final summary
  -> WeCom replyStream/template card or WeChat text/numeric approval
```

Remote adapters currently include:

- Enterprise WeChat / WeCom intelligent bot long connection through `@wecom/aibot-node-sdk`.
- Personal WeChat OpenClaw through Tencent `@tencent-weixin/openclaw-weixin@2.4.4`.

Personal WeChat PC hooks, reverse protocol clients, and wxauto are not wired into the default build and remain reserved.

## Skills, Plugins, MCP, Hooks

Skills and plugins are extension surfaces:

- project/user/cache/plugin skill discovery
- `.claude` folder discovery for compatibility
- `.deepseekcode` install targets
- local path, GitHub URL, Git URL, and `file://` Git installs
- manifest/BOM/path traversal validation
- plugin commands, skills, and hooks

MCP is exposed through `mcp_call`. Future work can expand individual MCP tools directly into native function schemas.

Hooks run around local tools. PreToolUse can block a tool; PostToolUse records output. Hook errors are stored as events and do not replace the main task result.

## Capability Status

| Capability | Status |
| --- | --- |
| Native tool calling | supported |
| File tools | supported |
| Shell tools | supported with permission |
| Browser CDP | partial |
| MCP | partial |
| Hooks | supported |
| Skills/plugins | supported |
| DOCX/PPTX | supported |
| TencentDB-Agent-Memory | supported |
| WeCom remote control | experimental / testable |
| Personal WeChat OpenClaw | experimental / testable |
| Personal WeChat hook | reserved |
| PDF | experimental |
| Long-running worker | partial |
| `computer_use` | reserved |

## Release Boundary

Published files are runtime source, assets, website, and user manuals. The release excludes prompt audits, test artifacts, local `.env`, runtime databases, generated reports, development handoff notes, and unconnected upstream source mirrors.
