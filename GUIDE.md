# DeepSeekCode Guide

DeepSeekCode is a DeepSeek-first local coding workbench. This guide covers the release build path: install it, point it at a project, keep secrets out of Git, and use the runtime commands that are shipped in this repository.

The public guide intentionally stays focused on using the project. Internal handoff notes, smoke scripts, research notes, and release staging files are not part of the published tree.

## Quick Start

Requirements:

- Node.js 22 or newer.
- A DeepSeek API key.
- A project directory that DeepSeekCode can inspect and edit.

Install and build:

```bash
git clone https://github.com/xh20010913-svg/DeepSeekCode.git
cd DeepSeekCode
npm install
npm run build
```

Create a local `.env` file or set these variables in your shell:

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
```

Run the workbench against a project directory:

```bash
npm run start -- --project "D:\code\DeepSeekTest"
```

For source-mode development, use:

```bash
npm run dev -- --project "D:\code\DeepSeekTest"
```

## First Run Checklist

1. Run `npm run doctor` to confirm Node, project path, model, provider, permissions, and state paths.
2. Run `npm run typecheck` before changing runtime code.
3. Run `npm run build` before publishing or sharing a release tree.
4. Keep `.env`, state databases, logs, `node_modules/`, and `dist/` out of commits unless a release process explicitly needs them.

## Project Scope

DeepSeekCode uses the `--project` path as the workspace boundary for file-oriented tools. Start it from the repository root or pass an explicit path:

```bash
npm run start -- --project "D:\code\SomeProject"
npm run start -- --project .
```

Runtime state defaults to `~/.deepseekcode`. Override it when you want a separate test sandbox:

```bash
npm run start -- --project "D:\code\DeepSeekTest" --data-dir "D:\code\DeepSeekTest\.deepseekcode-state"
```

When in doubt, use a disposable test project first. That keeps live tool runs, generated files, and local state away from the source repository.

## Permission Profiles

Shell and browser actions are off by default. Choose the smallest profile that fits the task:

| Profile | Shell | Browser | Use when |
| --- | --- | --- | --- |
| `safe` | off | off | Reading, editing, planning, and validating project files. |
| `dev` | on | off | Running local build, typecheck, and test commands. |
| `browser` | off | on | Inspecting a browser or UI surface through the browser bridge. |
| `open` | on | on | Trusted local development sessions that need both shell and browser tools. |

Examples:

```bash
npm run start -- --project . --permission-profile dev
npm run start -- --project . --allow-shell
npm run start -- --project . --allow-browser
```

Inside the workbench, use `/permissions`, `/shell on|off`, and `/browser on|off` to inspect or change the active session.

## Cache-First Workflow

DeepSeekCode treats prompt prefix stability as a runtime concern. Stable runtime rules, tool schemas, repository maps, project memory, and cache pins should stay early and deterministic; current user text and tool feedback should stay late.

Before a large task:

```text
/cache
/cache guard refactor the provider runtime without changing public commands
/cache prepare refactor the provider runtime without changing public commands
/cache profile save provider-refactor refactor the provider runtime without changing public commands
```

Use this pattern when the task will involve multiple files or several tool turns. It helps keep reusable context visible and makes cache drift easier to diagnose.

## Working In A Session

Useful commands:

```text
/help
/doctor
/status
/config
/files
/diff git
/plan start
/approval list
/memory list
/cache
/model verify
/quit
```

Typical flow:

1. Start with a plain request or `/plan start` for larger changes.
2. Review file changes with `/diff git`.
3. Run `npm run typecheck` or `npm run build` when local shell is enabled.
4. Use `/approval list`, `/trace <run>`, and `/events` if a run pauses or fails.

## Provider Profiles

The default provider configuration can come from environment variables:

```bash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEKCODE_REASONING_EFFORT=high
DEEPSEEKCODE_MAX_OUTPUT_TOKENS=1200
```

For multiple providers or accounts, set `DEEPSEEKCODE_PROVIDER_CONFIG` or create `.deepseekcode/providers.json` in the project. Prefer `api_key_env` entries so the JSON file can stay secret-free:

```json
{
  "default_profile": "deepseek-fast",
  "profiles": [
    {
      "name": "deepseek-fast",
      "kind": "open_ai_compatible",
      "base_url": "https://api.deepseek.com",
      "api_key_env": "DEEPSEEK_API_KEY",
      "model": "deepseek-v4-flash",
      "timeout_secs": 45,
      "reasoning_effort": "high"
    }
  ]
}
```

## Release Tree Rules

The published repository should contain files that a user needs to install, run, inspect, or view the project:

- Runtime source under `src/`.
- Website files under `website/`.
- Public docs: `README*.md`, `GUIDE.md`, `ARCHITECTURE.md`, `CLI_REFERENCE.md`.
- Public assets under `assets/`.
- Package metadata, license, TypeScript config, and GitHub Pages workflow.

Do not publish local secrets, generated build output, test sandboxes, internal handoff docs, or test artifacts:

```text
.env
.deepseekcode/
.release/
node_modules/
dist/
*.log
*.sqlite
docs/
scripts/
src/**/*.test.ts
```

## Troubleshooting

`npm run doctor` reports provider missing:

Set `DEEPSEEK_API_KEY` in the shell or in a local `.env` file. Do not commit the real key.

The README image is broken on GitHub:

Use paths relative to the repository root, such as `assets/readme-runtime-terminal.png`, and make sure the asset is committed.

The model cannot run local commands:

Start with `--permission-profile dev` or enable `/shell on` inside a trusted session.

State from one project appears in another project:

Pass a separate `--data-dir` for test runs or clean the state directory you selected.

## Related Documents

- [Architecture](./ARCHITECTURE.md)
- [CLI Reference](./CLI_REFERENCE.md)
- [Website](https://xh20010913-svg.github.io/DeepSeekCode/)
- [Website Guide](./website/guide.html)
