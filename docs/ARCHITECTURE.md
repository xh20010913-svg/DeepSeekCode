# DeepSeekCode Architecture

DeepSeekCode is a TypeScript-first, DeepSeek-first local coding agent. It borrows the proven module boundaries of mature terminal agents, but keeps its runtime behavior centered on DeepSeek cache stability, typed local actions, and durable state.

## Pillar 1: Cache-First Loop

DeepSeek prefix caching rewards stable bytes. DeepSeekCode keeps prompt blocks deterministic and separates stable context from volatile task data.

Stable blocks should appear early:

1. product identity and safety rules;
2. tool schema and action protocol;
3. accepted project memory;
4. repository map;
5. selected stable cache pins;
6. rolling summary.

Dynamic blocks appear late:

1. current user request;
2. current file excerpts;
3. failed-tool feedback;
4. validation results;
5. latest action-loop trajectory.

The cache system includes:

- `/cache` readiness report;
- `/cache guard <goal>` no-model preflight;
- `/cache prepare <goal>` stable pin application;
- `/cache profile save|match|forecast|prepare`;
- content-free prompt-shape fingerprints;
- provider-reported `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`.

## Pillar 2: Typed Local Action Runtime

The provider does not directly mutate the local machine. It returns a structured action envelope, then DeepSeekCode validates and executes.

```json
{
  "task_kind": "file_change",
  "needs_local_tools": true,
  "acceptance_criteria": ["project files created", "artifact validates"],
  "actions": [
    {
      "type": "write_file",
      "path": "index.html",
      "content": "<!doctype html>..."
    },
    {
      "type": "validate_artifact",
      "path": "index.html",
      "kind": "html"
    }
  ],
  "continue_work": false,
  "final_message": "Created and validated the HTML page."
}
```

Local execution enforces:

- project-root path safety;
- permission profile checks;
- shell/browser gates;
- approval gates for risky actions;
- artifact validation;
- compact feedback into the next provider turn.

## Pillar 3: Durable Long-Running Work

Long tasks should survive a redraw, retry, or terminal restart. DeepSeekCode stores work in SQLite:

- runs;
- tasks and dependencies;
- actions and artifacts;
- events and trace rows;
- validation gates;
- approval gates;
- memory promotions and reviews;
- token/cache usage.

The provider-backed multi-agent path uses a visible role flow:

```text
Commander
  -> Planner
  -> Builder
  -> Tester
  -> Reviewer
  -> rework branch when needed
```

## Module Map

```text
src/bootstrap       startup, env, project trust, runtime paths
src/cli             command-line entry, doctor, verify, start
src/components      Ink/React terminal UI components
src/commands        slash command router and command implementations
src/query           chat/action query engine and repair loop
src/tools           filesystem, shell, artifact, browser, MCP tool surfaces
src/state           durable SQLite read/write models
src/tasks           queue, run/task lifecycle, pause/resume/cancel
src/coordinator     multi-agent orchestration
src/context         repository map, context bundle, rolling summary, memory
src/skills          skill discovery and compatibility loading
src/plugins         plugin manifests and extension lifecycle
src/mcp             stdio/HTTP MCP clients and session pool
src/hooks           lifecycle hooks and command surfaces
src/services        DeepSeek provider, cache telemetry, diagnostics
src/bridge          future browser/computer/remote bridges
```

## TUI Direction

The terminal UI is Ink/React-based and optimized for Windows Terminal as well as Unix terminals.

Key UI principles:

- stable prompt editing with cursor-aware insert/delete;
- queued prompts while the current turn is working;
- command palette, history search, quick open, and shortcut help;
- compact transcript rows for user, assistant, tool, error, reasoning, and approval messages;
- cache/status footer that shows model, permission state, gates, and cache rate;
- panels for cache, approval, permissions, config, status, diff, plan, memory, tools, and MCP.

## Safety Boundary

DeepSeekCode should never hide dangerous work inside a prompt. If an action touches disk, shell, browser, MCP, external services, or future computer-use bridges, it should pass through a typed tool and leave a durable event.

This keeps the project inspectable, debuggable, and suitable for open-source collaboration.
