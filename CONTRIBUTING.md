# Contributing to DeepSeekCode

Thanks for helping improve DeepSeekCode. The project is DeepSeek-first, TypeScript-first, and safety-first.

## Before A PR

Run:

```powershell
npm run build
npm run smoke
npm run parity
```

If your change touches provider behavior, use `deepseek-v4-flash` for live smoke tests and keep token usage bounded.

## Rules

- Prefer TypeScript for core runtime work.
- Keep DeepSeek cache stability in mind: stable prompt blocks early, volatile feedback late.
- Use typed tools and approval gates for local side effects.
- Keep Windows Terminal behavior tested when touching the TUI.
- Be honest in docs: mark partial features as partial.

## Good First Areas

- README and website polish.
- CLI and slash command docs.
- Cache telemetry panels.
- Windows-safe prompt editing and picker behavior.
- Approval, diff, permission, MCP, skill, and plugin panels.
- Tests around prompt shape, path safety, and action-loop repair.

## Security Issues

For vulnerability reports and runtime boundary expectations, follow [SECURITY.md](./SECURITY.md).
