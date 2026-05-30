# DeepSeekCode Website Guide

This guide defines the public website shape for DeepSeekCode.

## Goals

- Present DeepSeekCode as a serious DeepSeek-first local coding agent.
- Explain prefix-cache stability, typed tools, durable state, and multi-agent work.
- Make setup obvious on Windows, macOS, and Linux.
- Keep the website focused on architecture, workflow, and project capabilities.
- Keep docs honest about implemented, partial, and planned features.

## Site Map

The repository includes a static site under `website/`.

| Page | File | Purpose |
| --- | --- | --- |
| Home | `website/index.html` | Product positioning, terminal preview, cache-first pillars, feature grid, install commands. |
| Guide | `website/guide.html` | Setup, commands, cache guard flow, testing workflow, release checklist. |
| Assets | `docs/assets/*` | Logo, README runtime image, terminal preview, feature grid. |
| README | `README.md` | GitHub landing page and long-form project overview. |
| Chinese README | `README.zh-CN.md` | Chinese GitHub landing page. |
| Japanese README | `README.ja-JP.md` | Japanese GitHub landing page. |

If GitHub Pages is enabled, use GitHub Actions to publish `website/` as the site root. The README links work locally before a hosted URL exists.

Planned URL:

```text
https://xh20010913-svg.github.io/DeepSeekCode/
```

## Visual Language

DeepSeekCode should feel like a terminal-native engineering tool:

- dark terminal canvas;
- cyan/teal/green accents for DeepSeek, cache, and readiness;
- yellow for cache guard warnings;
- red only for real errors or blocked actions;
- terminal interface previews rather than abstract AI decoration;
- short copy, direct commands, concrete technical claims.

The product should look competent, inspectable, and local-first.

## Homepage Sections

The homepage should keep this order:

1. Header navigation: install, cache, features, guide, roadmap, FAQ, GitHub.
2. Hero: product name, one-sentence value, install command.
3. Terminal preview.
4. Cache-first explanation.
5. Feature grid.
6. Setup commands.
7. Architecture flow.
8. Roadmap.
9. Technical FAQ.
10. Footer links.

## Guide Page Sections

The guide page should keep this order:

1. Prerequisites.
2. Clone/build/start.
3. Cache guard workflow.
4. Slash command quick reference.
5. Testing.
6. Release checklist.

## Copy Rules

- Use `DeepSeekCode`, not old project names.
- Product copy should talk about architecture, cache, tools, agents, state, TUI, and testing.
- Use `deepseek-v4-flash` for low-cost live smoke examples.
- Avoid defensive copy about copying, uploading, or private process details.
- Avoid claiming complete parity for features that are still partial.
- README screenshots should be captured from a real running terminal.

## Release Checklist

Before publishing website or README changes:

```powershell
npm run build
npm run smoke
npm run parity
```

Check the site locally:

```powershell
python -m http.server 5178 --bind 127.0.0.1 --directory website
```

Open:

```text
http://127.0.0.1:5178/
http://127.0.0.1:5178/guide.html
```

Public release content should stay focused on source, docs, website, and reusable assets.
