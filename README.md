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

You need:

- **Node.js 24+** ([nodejs.org](https://nodejs.org), or `winget install OpenJS.NodeJS.LTS`)
- **pnpm** (`corepack enable` on Node 24, or `winget install pnpm.pnpm`)
- **Docker Desktop**, running (no account needed)

Then, from the repo folder (PowerShell):

```powershell
pnpm install
Copy-Item .env.example .env
Copy-Item apps/client/.env.example apps/client/.env
pnpm dev
```

`pnpm dev` starts Postgres in Docker, applies migrations, and runs the server and client with hot reload. Open http://localhost:5173. Load sample players with `pnpm db:seed`.

There's nothing playable yet: the client and server are placeholders until Step 5 of the [infrastructure plan](docs/INFRASTRUCTURE_PLAN.md). See [AGENTS.md](AGENTS.md#commands) for every command.
