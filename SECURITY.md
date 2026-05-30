# Security Model

DeepSeekCode executes local tools, so security matters even during early development.

## Reporting

If you find a vulnerability, open a private report through GitHub security advisories when available. If that is not configured, contact the maintainer privately before publishing details.

## Tool Safety

The runtime should keep these boundaries:

- project-root path validation for file tools;
- explicit permission gates for shell/browser/MCP/computer-use actions;
- redaction before diagnostics are persisted;
- no raw API keys in errors, traces, telemetry, screenshots, or docs;
- bounded provider prompts and provider responses;
- content-free prompt-shape tracking for cache telemetry.

## Diagnostics

Diagnostics should describe provider, cache, git, model, permissions, and runtime state without persisting raw request bodies or chain-of-thought content.
