# not-feudalism

A multiplayer medieval strategy game played in the browser, inspired by Feudalism 2. Start as a peasant and farm, craft, trade, fight and scheme your way up to king.

> Early stage: planning and infrastructure setup. No playable build yet.

## Docs

| Doc | What's in it |
|---|---|
| [GUIDE.md](GUIDE.md) | Game vision, features, roadmap, decisions |
| [AGENTS.md](AGENTS.md) | **Start here if you're contributing** (humans and AI agents): stack, rules, workflow |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, multiplayer model, data model, hosting |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Code style, git, testing, CI, security |
| [docs/INFRASTRUCTURE_PLAN.md](docs/INFRASTRUCTURE_PLAN.md) | Step-by-step setup checklist |
| [docs/decisions/](docs/decisions/) | Architecture decision records |

## Getting started

You need Node.js 24+ and pnpm (see [AGENTS.md → Setup](AGENTS.md#setup)).

```bash
pnpm install
pnpm check
```

There's nothing playable yet. `pnpm dev` (local database, server and client) arrives in Step 4 of the [infrastructure plan](docs/INFRASTRUCTURE_PLAN.md).
