# DeepSeekCode API Reference

Version: `v0.2.9`

This document describes public and internal extension surfaces that are stable enough to document.

## CLI

```cmd
deepseekcode [options]
```

| Option | Type | Meaning |
| --- | --- | --- |
| `--project` | path | Project root, default current directory. |
| `--data-dir` | path | Runtime data dir, default `<project>\.deepseekcode`. |
| `--model` | string | Provider model. |
| `--continue` | flag | Continue latest session. |
| `--resume` | session id | Resume a known session. |
| `--doctor` | flag | Print diagnostics and exit. |
| `--allow-shell` | flag | Enable shell for this process. |
| `--allow-browser` | flag | Enable browser bridge for this process. |
| `--permission-profile` | string | Permission profile such as `safe`, `dev`, `browser`, `open`. |
| `--wecom` | flag | Start WeCom remote mode. |
| `--wechat-login` | flag | Login personal WeChat OpenClaw. |
| `--wechat` | flag | Start personal WeChat OpenClaw remote mode. |
| `-p, --prompt` | string | Run one prompt and exit. |

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

Skills/plugins/MCP:

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

Agent workflow:

```text
/agents start <task>
/agents status
/agents message <role> <message>
/agents stop
```

## Remote Commands

WeChat/WeCom text commands:

```text
/help
/status
/status full
/ask <question>
/project
/project <path>
/run <task>
/continue
/stop
/artifacts
/usage
/shell on
/shell off
```

Approval menu for personal WeChat:

```text
1 allow once
2 allow for this session
3 reject
4 stop task
```

## Provider-Facing Tool Registry

Tool arguments are Zod-validated. Important tools include:

| Tool | Status | Purpose |
| --- | --- | --- |
| `read_file` | supported | Read project files. |
| `write_file` | supported | Write files after read/permission checks. |
| `append_file` | supported | Append content. |
| `apply_patch` | supported | Structured patch editing. |
| `list_files` | supported | List directory contents. |
| `grep_files` | supported | Search file contents. |
| `glob_files` | supported | Find files by pattern. |
| `run_command` | permissioned | Execute shell with Windows preflight and failure classification. |
| `verify_project` | partial | Inspect and validate real project artifacts. |
| `launch_project` | partial | Start/open project entry and collect diagnostics. |
| `browser_agent` | partial | Browser automation adapter backed by built-in browser tooling where available. |
| `create_docx` | partial | Generate DOCX. |
| `create_pptx` | partial | Generate PPTX. |
| `create_pdf` | experimental | PDF generation/preview support is conservative. |
| `search_skills` | supported | Search installed skills. |
| `invoke_skill` | supported | Run a named skill. |
| `mcp_call` | partial | Call configured MCP server tools. |
| `start_agent_workflow` | experimental | Start role-based workflow. |
| `send_agent_message` | experimental | Send message to workflow role/blackboard. |
| `agent_status` | experimental | Inspect workflow state. |
| `finish_agent_workflow` | experimental | Finish workflow and summarize acceptance. |

## Run Events

Run events should be compact and useful for both TUI and remote:

```ts
type RunProgressSnapshot = {
  phase: string;
  elapsedMs: number;
  lastModelCall?: string;
  lastTool?: string;
  pendingGate?: string;
  todoCounts?: { pending: number; inProgress: number; completed: number };
  artifactCounts?: Record<string, number>;
  usage?: { input: number; output: number; cacheHit?: number; cacheMiss?: number; costUsd?: number };
  staleReason?: string;
};
```

Avoid exposing internal run ids, approval ids, raw JSON, or secrets in user-facing renderers.

## RemoteDeliveryPlan

The runtime decides what to send remotely from actual artifacts:

```ts
type RemoteDeliveryPlan = {
  summary: string;
  previewImages: string[];
  files: string[];
  entrypoints: string[];
  manifest: Array<{ path: string; kind: string; size?: number }>;
  warnings: string[];
};
```

Rules:

- HTML gets screenshots first.
- Office/PDF can be sent as files.
- Images are sent as images.
- Markdown/text are summarized unless requested.
- Source files in multi-file projects are not spammed into chat.

## Agent Workflow

```ts
type AgentRoleSpec = {
  name: string;
  purpose: string;
  tools: string[];
  skills: string[];
  inputs: string[];
  outputs: string[];
  acceptance: string[];
};
```

Default roles are Planner, Builder, Tester, and Reviewer. Reviewer acceptance must check artifacts, startup, blank pages, build/test, and original requirements.

## Cache Report

`/cache report` combines:

- provider telemetry hit/miss rate
- stable prefix pins
- prompt-shape repetition
- risky dynamic context
- actionable recommendations

The goal is stable prefix reuse plus compact dynamic state, not blind history deletion.
