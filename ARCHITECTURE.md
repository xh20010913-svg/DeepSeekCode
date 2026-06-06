# DeepSeekCode Architecture

Version: `v0.2.9`

DeepSeekCode is a local runtime for DeepSeek native tool calling. Its design goal is to keep the model responsible for reasoning and task intent while the runtime owns tools, permission gates, project state, platform safety, verification, remote rendering, and resumability.

## Runtime Chain

```text
TUI / CLI / WeChat / WeCom
  -> command router or QueryEngine
  -> prompt planner
  -> DeepSeek provider with native tools[]
  -> tool_calls
  -> local tool registry
  -> hooks + permission gate + platform preflight
  -> tool execution
  -> compact tool_result
  -> next provider turn / repair / verification / final answer
```

The provider-facing loop no longer depends on model-emitted ActionEnvelope JSON. Internal JSON, Zod schemas, and SQLite records remain for validation, configuration, state, and reports.

## Major Subsystems

| Subsystem | Responsibility |
| --- | --- |
| QueryEngine | Builds messages, calls the provider, executes tool calls, records usage and events. |
| Tool registry | Exposes file, shell, browser, Office, skills, MCP, verification, and workflow tools. |
| Permission service | Gates shell, browser, MCP, SSH, and risky actions across TUI and remote channels. |
| State store | Persists sessions, runs, events, tasks, artifacts, approvals, usage, and checkpoints. |
| Memory | Integrates TencentDB-Agent-Memory with local SQLite recall/capture. |
| Skills/plugins | Installs, validates, searches, and invokes local or Git-backed skills/plugins. |
| MCP | Provides unified `mcp_call`; native per-tool schema expansion is planned. |
| Remote channels | WeCom and personal WeChat OpenClaw share the same QueryEngine and state. |
| Agent workflow | Supervisor + role specs + shared blackboard + Reviewer acceptance. |
| Artifact delivery | Plans readable remote previews based on real file type and manifest. |

## Windows Preflight

`run_command` performs a platform preflight before shell execution. The preflight only checks whether a command is executable on Windows; it does not infer task intent.

Detected classes:

- POSIX commands: `mkdir -p`, `cat`, `touch`, `rm -rf`, `cp -r`, `ls -la`.
- bash-only syntax: heredoc, `/dev/null`, known bash fragments.
- failure classification after execution: `node-gyp`, Visual Studio toolchain, Node version mismatch, port conflicts, npm install failures, command not found.

The result is returned to the model as tool feedback so it can repair the command or choose a simpler dependency.

## Project Verification

`verify_project` and `launch_project` are generic tools.

They inspect real files:

- `package.json`: install/build/test/start/dev scripts when shell is allowed.
- HTML: browser open, screenshot, blank-page detection, local asset checks.
- Services: launch command, port and health checks where possible.
- Office/PDF: existence, file size, previewability.
- Multi-file projects: entry, manifest, screenshot, and launch command summary.

Failures are not final answers. They are tool results that the model should use to repair and verify again within budget.

## Remote Control

Remote channels are not separate agents. They send messages into the same runtime:

```text
WeChat / WeCom message
  -> access policy
  -> project binding
  -> QueryEngine
  -> event stream
  -> RemoteReplyRenderer
  -> RemoteDeliveryPlan
```

Remote output is concise by design:

- Ordinary chat returns a normal assistant answer.
- Tasks show progress, permissions, status, and final summary.
- `/ask` runs a read-only side question.
- Artifact delivery prefers screenshots or previewable files instead of source-file spam.

## Multi-Agent Workflow

The first production shape is centrally orchestrated:

```text
Supervisor
  -> Role specs
  -> Independent role summaries/checkpoints
  -> Shared blackboard
  -> Reviewer acceptance
  -> Main-session summary
```

Default roles are Planner, Builder, Tester, and Reviewer. Complex projects may add Frontend, Backend, DB, QA, Docs, or domain-specific roles. Reviewer acceptance must cover artifacts, startup, blank pages, console errors, build/test status, and the original requirement.

The workflow is experimental. It is designed for traceability and future dashboard visualization rather than fully unconstrained agent-to-agent chatter.

## Context And Cache

DeepSeek context caching works best when prefix blocks remain stable. DeepSeekCode keeps these blocks ordered:

1. System/runtime rules.
2. Provider/tool compatibility notes.
3. Stable tool schemas sorted by tool name.
4. Skills/plugin index summaries.
5. Project rules and memory summary.
6. Recent task context.
7. Rolling summary, run state, artifacts, and compact tool results.

Long stdout, diffs, logs, and screenshots are not repeatedly injected verbatim. They are stored as events/artifacts and summarized as paths, status, key error, and manifest entries.

`/cache report` explains provider telemetry, stable prefix pins, prompt-shape repetition, and low-hit causes.

## Capability Status

| Capability | Status |
| --- | --- |
| Native DeepSeek tools | Verified |
| File tools | Verified |
| Windows preflight | Verified |
| Project verification | Partial |
| Browser/CDP | Partial |
| Skills/plugins | Verified |
| MCP | Partial |
| WeCom remote | Experimental |
| Personal WeChat OpenClaw | Experimental |
| Multi-agent workflow | Experimental |
| Computer use | Reserved |

## Release Boundary

The GitHub release tree is `.release`. It includes source, website, README, user manuals, public assets, and package metadata. It must not include test outputs, prompt audits, runtime databases, login state, generated reports, `node_modules`, or npm tarballs.
