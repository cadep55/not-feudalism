# AGENTS.md: How We Build Not Feudalism

This is the shared playbook for every contributor, both humans and AI coding agents (Claude Code, Codex, Cursor, Copilot and others). Read it before you change anything. If something here is wrong or out of date, fix it in the same PR as the change that made it wrong.

> **Status:** the tech stack is **Proposed** (see [ADR 0001](docs/decisions/0001-tech-stack.md)) until both owners accept it. The monorepo, tooling, CI and local dev environment exist (Steps 1–4 of [docs/INFRASTRUCTURE_PLAN.md](docs/INFRASTRUCTURE_PLAN.md)). Folders and commands marked *(planned)* arrive in later steps.

## The game in one paragraph

A persistent online medieval world in the spirit of Feudalism 2. Players start as peasants, then farm, craft, trade, fight and scheme their way up the feudal ladder (peasant → knight → lord → king). It's easy to start, slow to master, and built so players depend on each other. The full vision and feature list are in [GUIDE.md](GUIDE.md).

**We're in Phase 1: single player** ([ADR 0002](docs/decisions/0002-single-player-first.md)). Each player has their own persistent world; the server still runs every rule, over HTTP (`GET /game/state`, `POST /game/actions`), so progress carries into **Phase 2: multiplayer**, which adds Colyseus rooms. Don't build multiplayer features (rooms, chat, player market) until Phase 2 starts; check the issue's milestone.

## Where to look

| You need… | Read |
|---|---|
| What we're building and why | [GUIDE.md](GUIDE.md) |
| How the system fits together, multiplayer model, hosting | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Code style, git workflow, testing rules, security rules | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| The ordered setup checklist (what to build next) | [docs/INFRASTRUCTURE_PLAN.md](docs/INFRASTRUCTURE_PLAN.md) |
| Why a decision was made | [docs/decisions/](docs/decisions/) |

## Stack at a glance

- **Language:** TypeScript (strict) everywhere, on Node.js 24 LTS
- **Monorepo:** pnpm workspaces + Turborepo
- **Client:** Phaser (2D pixel-art game canvas) + React (menus, HUD, chat) + Vite, served as a static site in the browser
- **Server:** Node.js + Colyseus (authoritative real-time rooms) + Express (HTTP API: auth, accounts)
- **Shared game rules:** `packages/shared`, pure TypeScript with no I/O, used by both client and server
- **Database:** PostgreSQL + Drizzle ORM (migrations committed to git)
- **Validation:** Zod schemas for every message and request crossing the network
- **Testing:** Vitest (unit and integration), fast-check (property tests for economy rules), Playwright (end-to-end, including two-player tests)
- **Lint/format:** Biome
- **CI/CD:** GitHub Actions; client on Cloudflare Pages, server and Postgres on Railway

## Setup

1. **Node.js 24 or newer** (the project targets 24 LTS; see `.nvmrc`).
2. **pnpm**, at the version pinned in `package.json` → `packageManager`. On Node 24 run `corepack enable`. On Node 25+ (no Corepack) install it with `winget install pnpm.pnpm` (Windows) or `npm install -g pnpm`.
3. **Docker Desktop**, running (for local Postgres). No Docker account needed.
4. `pnpm install`. This also installs the git hooks (lefthook): Biome formats staged files on commit, and `pnpm check` runs before push.
5. Copy the env examples: `.env.example` → `.env`, and `apps/client/.env.example` → `apps/client/.env`. The defaults match `docker-compose.yml`.
6. `pnpm dev`, then open http://localhost:5173.
7. Editor: VS Code with the recommended extensions in `.vscode/extensions.json` (Biome formats on save).

## Repository layout

```
apps/
  client/        React screens (src/ui), Phaser world (src/game), server calls (src/net)
  server/        Express HTTP API (auth, game actions); Colyseus rooms in Phase 2
packages/
  shared/        Game rules, data tables, types, Zod schemas (pure, no I/O)
  db/            Drizzle schema, migrations (generated, never hand-edited), seed
  config/        Shared tsconfig presets (base, node, browser)
e2e/             Playwright end-to-end tests (real browser, server and database)
docs/            Architecture, conventions, plans, decision records
.github/         CI workflows, PR/issue templates, CODEOWNERS, Dependabot
docker-compose.yml   Local Postgres (Redis later)
```

Workspace packages are named `@nf/<folder>` and export their TypeScript source directly (`"exports": "./src/index.ts"`). Import across packages by name (`import { ok } from "@nf/shared"`), never by relative path.

## Commands

```bash
pnpm install          # install everything (and git hooks)
pnpm dev              # start Postgres (Docker), migrate, then server + client with hot reload
pnpm check            # lint + typecheck + unit tests; must pass before every PR
pnpm test             # unit tests (no database needed)
pnpm test:integration # integration tests (*.int.test.ts) against Postgres; run pnpm db:up first
pnpm test:e2e         # Playwright in a real browser against pnpm dev (first time: pnpm --filter @nf/e2e exec playwright install chromium)
pnpm typecheck        # TypeScript in every package
pnpm lint             # Biome lint + format check
pnpm format           # Biome auto-fix: format, organise imports, safe lint fixes
pnpm build            # production build of every app
pnpm db:up            # start local Postgres in Docker (pnpm db:down stops it)
pnpm db:migrate       # apply database migrations
pnpm db:generate      # create a migration after changing packages/db/src/schema.ts
pnpm db:seed          # load development seed data (players Alice and Bob)
pnpm db:reset         # wipe the local database, then migrate and seed
pnpm db:studio        # browse the database in Drizzle Studio
```

Integration tests are named `*.int.test.ts`, so `pnpm test` skips them. In CI they run in a separate job with a Postgres service.

Run one package's task with a filter, e.g. `pnpm --filter @nf/shared test`.

## Golden rules

These are non-negotiable. A PR that breaks one gets sent back.

1. **The server is the authority, in single player too.** The client sends *intents* ("craft 1 sword"), never *results* ("I now have a sword"). The server validates every intent against the shared rules and the database, then returns (Phase 1) or broadcasts (Phase 2) the new state. Assume every client is hacked.
2. **Game rules live in `packages/shared` and are pure functions.** No network, database, clock, or `Math.random()` inside rules: pass in `now` and a seeded RNG. That makes them testable, and lets client and server agree.
3. **Balance numbers are data, not code.** Prices, timers, recipes, drop rates and rank requirements live in data tables under `packages/shared/src/data/`. Never hard-code a number like `const SWORD_COST = 12` inside logic.
4. **Every network message has a Zod schema** in `packages/shared/src/protocol/`. The server parses with it before doing anything else.
5. **Time-based actions use timestamps, not ticking loops.** Store `startedAt` / `completesAt` and compute progress when needed. Never write a loop that updates every player every second.
6. **Database changes only through Drizzle migrations.** Never edit a committed migration; add a new one.
7. **No secrets in the repo.** This repository is **public**. Secrets go in `.env` (git-ignored) locally and in GitHub/Railway/Cloudflare secret settings for deploys. Commit only `.env.example` with fake values.
8. **Tests come with the change.** New rule → unit test. New room message → integration test. New player-facing flow → extend an e2e test. Bug fix → a test that failed before the fix.
9. **Small PRs, one concern each.** Aim for under ~400 changed lines. Large features ship behind a feature flag in several PRs.
10. **Record decisions.** Any choice that is hard to reverse (a library, a protocol, a data model) gets a short ADR in `docs/decisions/`, and a one-line entry in the Decisions section of [GUIDE.md](GUIDE.md).

## Workflow for every task

1. **Start from an issue.** Pick or create a GitHub Issue describing the outcome and acceptance criteria.
2. **Branch from up-to-date `main`:** `git switch main && git pull && git switch -c feat/<issue-number>-short-name` (prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`).
3. **Read before writing.** Look at neighbouring code and match its patterns. Check `docs/` for the relevant rules.
4. **Make the change with its tests.**
5. **Run `pnpm check`** (and `pnpm test:e2e` if you touched a player-facing flow) until it's green.
6. **Commit** using Conventional Commits: `feat(economy): add bakery recipe`, `fix(server): reject negative trade quantity`.
7. **Open a PR** using the template. Link the issue (`Closes #12`), describe what changed and how you tested it, and include a screenshot or GIF for visual changes.
8. **Get one review from the other owner** (human). CI must be green. Squash-merge.

## Definition of done

- [ ] Acceptance criteria in the issue are met
- [ ] `pnpm check` passes locally and in CI
- [ ] Tests added or updated (see rule 8)
- [ ] No hard-coded balance numbers, secrets or debug logs left behind
- [ ] Docs, `.env.example` and this file updated if behaviour, commands or setup changed
- [ ] ADR written if a hard-to-reverse decision was made

## Extra rules for AI agents

- **Stay in scope.** Do the task in the issue or prompt. Note unrelated problems in the PR description or a new issue instead of fixing them in passing.
- **Don't add dependencies casually.** Prefer what's already installed. If you need a new package, say why in the PR and pick a well-maintained one. Versions are pinned exactly (`savePrefix: ""` in `pnpm-workspace.yaml`). If pnpm says a dependency's install script was blocked, don't just approve it: check what the script does and explain in the PR.
- **Never weaken a test to make it pass,** never skip or delete failing tests without explaining why in the PR, and never disable lint rules inline without a comment saying why.
- **Never touch secrets, production data or deploy settings.** Never run migrations against staging or production. CI does that.
- **Don't push to `main`.** Always use a branch and a PR.
- **Report honestly.** If you couldn't run the tests or something is unverified, say so in the PR.
- **When unsure about game design** (balance, mechanics, story), don't invent it. Leave a `TODO(design):` comment and ask in the PR. The game design belongs to the owners.

## Owners

| Area | Owner |
|---|---|
| Repo and infrastructure | cadep55 |
| Game design, programming, art | TBD (see Division of Work in [GUIDE.md](GUIDE.md)) |

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
