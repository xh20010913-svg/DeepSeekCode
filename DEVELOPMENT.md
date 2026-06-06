# DeepSeekCode Development Guide

Version: `v0.2.9`

This document is for contributors and future maintenance work. It describes how to extend the runtime without turning it into a collection of disconnected features.

## Repository Layout

```text
src/
  cli/                  CLI entry and TUI startup
  commands/             slash commands and command router
  provider/             DeepSeek/OpenAI-compatible provider calls
  protocol/             typed action and tool schemas
  query/                prompt assembly and tool-call loop
  services/             agents, approvals, cache, memory, state
  remote/               WeChat/WeCom adapters, rendering, delivery
  tools/                local tool registry and implementations
  tui/                  Ink UI components
website/                public website
assets/                 public README/website assets
```

## Development Rules

- Prefer native tool calls over model-emitted JSON plans.
- Keep task intent in the model; keep permissions, platform safety, and artifact typing in the runtime.
- Do not add keyword hacks such as “if prompt contains website”.
- Add Zod schemas for every provider-facing tool.
- Tool output should be useful for the next model turn: status, target, key result, key error, and compact context.
- Never replay long stdout/diff/log content repeatedly; store details as events/artifacts and summarize.
- Test outputs belong outside the release tree, normally `D:\code\DeepSeekTest`.

## Native Tool Loop

```text
build messages
  -> provider call with tools[]
  -> tool_calls
  -> validate args with Zod
  -> hooks and permission gate
  -> platform preflight
  -> execute
  -> compact tool_result
  -> next provider turn
```

If a gateway/model does not support native tool calls, the runtime should fail clearly instead of silently falling back to JSON planning.

## Windows Preflight

`src/tools/commandPreflight.ts` handles command compatibility and failure classification.

Add new rules only when they are platform checks, not task-intent checks. Good examples:

- `mkdir -p` is not PowerShell-compatible.
- `rm -rf` should become `Remove-Item -Recurse -Force`.
- `node-gyp` failed because Visual Studio build tools are missing.

Bad examples:

- “Prompt mentions website, therefore require HTML.”
- “Prompt mentions PPT, therefore force create_pptx.”

## Project Verification

`src/tools/projectVerification.ts` owns `verify_project` and `launch_project`.

Design principles:

- Inspect real files first.
- Prefer package scripts over invented commands.
- Capture browser evidence for HTML/UI tasks.
- Return actionable failures, not vague completion messages.
- Let the model repair using tool feedback.

When adding a new artifact class, update:

- `projectVerification.ts`
- `remote/delivery.ts`
- README/GUIDE capability matrix
- API_REFERENCE tool table

## Remote Channels

Remote adapters should never create independent agent logic. They should:

1. Authenticate/authorize the sender.
2. Bind the sender to a project.
3. Send messages into QueryEngine.
4. Render concise progress with `RemoteReplyRenderer`.
5. Deliver artifacts with `RemoteDeliveryPlan`.

Remote output should avoid console logs, raw JSON, approval ids, run ids, secrets, and long file lists.

## WeChat OpenClaw

Personal WeChat is experimental. Keep all OpenClaw API access inside the wrapper/service layer so the rest of the runtime is insulated from SDK changes.

Important behavior:

- Browser QR login is preferred over terminal QR rendering.
- Incoming messages must be mirrored to TUI listeners.
- Ordinary chat should not be forced into task-result templates.
- `/ask` is read-only and must not mutate the active task.
- Artifact delivery should prefer image previews and previewable documents.

## Skills And Plugins

Skills are capability prompts and workflows. They do not replace low-level tools.

Install sources:

- local path
- GitHub URL
- Git URL
- `file://` Git repository

Runtime behavior:

- `search_skills` and `invoke_skill` are provider-facing native tools.
- The model chooses skills from task semantics and skill descriptions.
- `disable-model-invocation: true` removes a skill from automatic candidates.
- Installed copies live under `.deepseekcode`, not the source repository.

## MCP

MCP currently enters through `mcp_call`. When adding direct schema expansion, ensure:

- Stable tool ordering.
- Permission gates for risky tools.
- PreToolUse/PostToolUse hook support.
- Compact tool_result summaries.
- Mock stdio/http tests.

## Multi-Agent Workflow

The current design is central orchestration:

- Main agent starts a workflow.
- Roles receive specs and limited tool permissions.
- Shared blackboard records role messages.
- Reviewer is always present for acceptance.
- Main session receives summaries and blockers.

Do not implement unbounded agent chatter. The system should stay traceable and resumable.

## Cache And Context

The cache strategy is based on stable prefixes:

- Fixed system prompt order.
- Fixed tool schema order.
- Stable skills index summary.
- Compact dynamic blocks.
- Rolling summaries for old context.
- Tool-result micro summaries.

Use `/cache report` to inspect provider telemetry and prompt shapes. Do not delete useful history just to reduce token counts; summarize it into run state and artifact manifests.

## Testing

Base checks:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
```

Recommended real scenarios:

- Multi-agent frontend/backend shop: generate, install, launch, verify, self-repair.
- GSAP animation page: automatic skill invocation and browser screenshot.
- DOCX/PPTX/XLSX/PDF generation and remote delivery.
- MCP mock stdio/http call success/failure.
- WeChat remote ordinary chat, task, `/ask`, `/status full`, approval, and artifact preview.
- Long task with `/cache report` and token/cost comparison.

Keep all generated outputs in `D:\code\DeepSeekTest` or another external test directory.

## Release

From `.release`:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd pack --dry-run
git status --short
git add <intended files>
git commit -m "Release v0.2.9 agent workflow validation and remote preview"
git push origin main
```

Optional npm tarball for manual publish:

```cmd
npm.cmd pack --pack-destination D:\code\DeepSeekTest\npm-packages
```

Do not commit test projects, `.env`, prompt audit, runtime state, login state, reports, `node_modules`, or npm tarballs.
