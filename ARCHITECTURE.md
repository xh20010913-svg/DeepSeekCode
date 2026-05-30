# DeepSeekCode Architecture

DeepSeekCode is organized as a local terminal workbench around DeepSeek, typed tool execution, durable state, and explicit permission boundaries. The release architecture is intentionally practical: it explains the runtime pieces a user or contributor needs to understand without carrying internal planning notes.

## Runtime Overview

```text
CLI entrypoint
  -> bootstrap config
  -> Ink/React workbench or headless prompt
  -> QueryEngine
  -> DeepSeek provider client
  -> structured action envelope
  -> typed tool executor
  -> SQLite state and artifacts
```

The CLI entrypoint is `src/cli/main.tsx`. It parses flags, loads config, opens the state store, and either renders the terminal workbench or runs a headless prompt.

The `QueryEngine` is the orchestration center. It classifies a turn, chooses chat or local-tool flow, prepares stable prompt blocks, asks DeepSeek for an action envelope, executes validated tool actions, records state, and streams terminal events back to the UI.

## Pillar 1: Cache-First Loop

DeepSeekCode keeps a stable prompt prefix for runtime instructions and tool schemas. Dynamic task content is added later. This lets large local tasks reuse as much DeepSeek prefix cache as possible.

Important pieces:

- Stable runtime prompt: immutable tool and behavior instructions.
- Cache pins: project facts that should stay stable across turns.
- Repository map: bounded project context built from the selected workspace.
- Cache guard: preflight checks, shape history, readiness reports, and profile forecasts.
- Telemetry: provider usage snapshots with cache hit and miss tokens when available.

User-facing commands include:

```text
/cache
/cache guard <goal>
/cache prepare <goal>
/cache profile save <name> <goal>
```

## Pillar 2: Typed Local Action Runtime

The model does not directly edit files or run shell commands. It proposes a structured action envelope. DeepSeekCode validates that envelope before execution.

Execution boundaries:

- File tools are scoped to the launched `--project` path.
- Patch and write actions produce explicit artifact records.
- Shell execution is disabled unless the active permission profile allows it.
- Browser actions are disabled unless browser permission is enabled.
- Approval and validation gates can pause work before sensitive actions continue.

This design keeps local automation inspectable. It also makes the terminal UI, state database, and final report agree about what actually happened.

## Pillar 3: Durable Long-Running Work

Runs are persisted in SQLite instead of living only in terminal memory. The state store records:

- Runs and statuses.
- Tool actions and artifacts.
- Events and traces.
- Tasks and task dependencies.
- Approval and validation gates.
- Usage snapshots and cache telemetry.
- UI state and context checkpoints.

This makes `/runs`, `/trace`, `/events`, `/approval list`, and related commands useful after the terminal has redrawn or a run has paused.

## Main Modules

| Area | Path | Responsibility |
| --- | --- | --- |
| CLI | `src/cli/main.tsx` | Parse flags, load config, run workbench, doctor, verify-model, or headless prompt. |
| Config | `src/bootstrap/config.ts` | Load `.env`, provider config, model, data dir, and permission profile. |
| Orchestration | `src/query/QueryEngine.ts` | Classify turns, build prompts, run action loop, stream events, record state. |
| Commands | `src/commands/` | Slash command catalog and command handlers. |
| Provider | `src/services/deepseek/` | DeepSeek-compatible API client. |
| Tools | `src/tools/` | Typed local action execution and tool adapters. |
| State | `src/state/sqlite.ts` | SQLite schema and durable runtime records. |
| Permissions | `src/services/permissions/` | Safe/dev/browser/open profiles and runtime toggles. |
| Cache | `src/services/cache/` | Guard reports, pins, profiles, telemetry, prompt-shape checks. |
| UI | `src/components/` | Ink/React terminal panels and workbench rendering. |
| Website | `website/` | Static public site and guide page. |

## Configuration Loading

DeepSeekCode loads environment in this order:

1. `.env` from the current process directory.
2. `.env` from the `--project` directory.
3. Explicit provider profile JSON via `DEEPSEEKCODE_PROVIDER_CONFIG`.
4. Project provider profile at `.deepseekcode/providers.json`.
5. Data-dir provider profile at `$DEEPSEEKCODE_HOME/config/providers.json`.

The default data directory is `~/.deepseekcode`, or `DEEPSEEKCODE_HOME` when set. Runtime state is stored below `state/deepseekcode.sqlite`.

## Permission Model

The runtime starts in `safe` mode unless configured otherwise.

| Profile | Shell | Browser |
| --- | --- | --- |
| `safe` | off | off |
| `dev` | on | off |
| `browser` | off | on |
| `open` | on | on |

CLI flags can grant tool categories for a session:

```bash
npm run start -- --project . --permission-profile dev
npm run start -- --project . --allow-shell
npm run start -- --project . --allow-browser
```

Slash commands such as `/permissions`, `/shell on|off`, and `/browser on|off` expose the active state in the workbench.

## Extension Points

DeepSeekCode supports several extension surfaces:

- Slash commands in `src/commands/`.
- User and plugin command discovery.
- Skills, plugins, hooks, and MCP adapters.
- Provider profiles for OpenAI-compatible DeepSeek endpoints.
- Website assets and static pages.

When adding a runtime feature, keep the same boundaries: parse user intent in commands or QueryEngine, validate with typed services, execute through the tool runtime, and record state in SQLite when the action has lasting value.

## Release Boundary

The release tree keeps user-facing runtime files and public docs. It does not include internal development notes, test scripts, smoke output, local secrets, or generated build folders. Public documentation belongs at the repository root or in the static `website/` tree so GitHub links resolve without the old `docs/` directory.

Related:

- [Guide](./GUIDE.md)
- [CLI Reference](./CLI_REFERENCE.md)
