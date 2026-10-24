# Infrastructure Plan

The ordered checklist for going from an empty repo to a hosted single-player game, then to multiplayer. Work top to bottom: each step builds on the ones before it. Tick boxes as you go, and turn each step into a GitHub Issue when you start it.

**Who does it:**

- 🧑 **owner:** needs a human with account access (sign-ups, billing, repo settings, secrets)
- 🤖 **agent:** an AI agent or any contributor can do it in a PR

Development runs in two phases ([ADR 0002](decisions/0002-single-player-first.md)):

- **Phase 1, single player (Steps 5–8):** play alone in a persistent world. The server runs the rules over HTTP, so progress carries into Phase 2.
- **Phase 2, multiplayer (Step 9):** a shared world with rooms, chat and a player market.

The goal of Steps 0–5 is a **single-player walking skeleton**: sign up, walk around the map, reload and be in the same place, with CI guarding every change. Steps 6–8 put it online and add the core loop. Issues are grouped under the GitHub milestones **Phase 1: Single player** and **Phase 2: Multiplayer**.

---

## Step 0: Decisions and accounts (🧑, about an hour)

- [ ] 🧑 Both owners read [ADR 0001](decisions/0001-tech-stack.md) and either accept it or change it. Record the result in the Decisions section of [GUIDE.md](../GUIDE.md).
- [ ] 🧑 Add the second owner as a collaborator: repo **Settings → Collaborators**. *(Invite sent to ExyyP; waiting for them to accept.)*
- [ ] 🧑 Upgrade Node.js on every dev PC to **24 LTS or newer**. Install from nodejs.org, `winget install OpenJS.NodeJS.LTS`, or `fnm`/`nvm-windows`. *(cadep55's PC: Node 26 installed.)*
- [ ] 🧑 Install pnpm: `corepack enable` on Node 24, or `winget install pnpm.pnpm` on Node 25+ (no Corepack). *(cadep55's PC: done.)*
- [ ] 🧑 Make sure Docker Desktop runs (needed for local Postgres).
- [ ] 🧑 Decide whether the repo stays **public** (free CI minutes and security tools, but anyone can read the code) or goes private.

## Step 1: Repo foundations (🤖 PR, owner merges)

- [x] `.gitignore` (Node, Vite, env files, OS junk, Playwright reports), `.gitattributes` (LF line endings, LFS for art/audio), `.editorconfig`
- [x] `.nvmrc` / `engines` pinning Node 24, and `packageManager` pinning the pnpm version
- [ ] 🧑 `LICENSE` (owners choose: proprietary "All rights reserved", or an open-source licence). Until then the code is all rights reserved by default.
- [x] `.github/pull_request_template.md`, issue templates (Feature, Bug, Task), `CODEOWNERS`
- [x] `.github/dependabot.yml` (npm + GitHub Actions, weekly, grouped)
- [x] Update `README.md`: what the game is, quick start, links to docs

## Step 2: Monorepo and tooling (🤖)

- [x] pnpm workspace (`pnpm-workspace.yaml`) and Turborepo (`turbo.json`) with `dev`, `build`, `typecheck`, `test`, `lint` pipelines
- [x] `packages/config`: base, node and browser `tsconfig` presets (strict settings from [CONVENTIONS.md](CONVENTIONS.md)). Packages use Vitest's defaults; add a shared Vitest preset when two packages need the same config
- [x] Biome config at the root, plus a `pnpm check` script (lint + typecheck + unit tests)
- [x] Pre-commit hook with **lefthook**: Biome format on staged files. Pre-push: `pnpm check`
- [x] Placeholder `apps/client`, `apps/server`, `packages/db` packages that typecheck, and `packages/shared` with the `RuleResult` helpers, `PROTOCOL_VERSION` and tests

## Step 3: CI (🤖 PR, then 🧑 settings)

- [x] 🤖 `.github/workflows/ci.yml`: install → `biome ci` → typecheck → unit tests with coverage → build, with pnpm and Turborepo caching
- [x] 🤖 Add a Postgres service container and integration-test job (once `packages/db` exists)
- [x] 🤖 `.github/workflows/codeql.yml`
- [x] 🧑 **Branch protection on `main`:** require PR, require CI status checks, require 1 approval, block force-push and deletion. *(On, admins included. Approvals are set to 0 until the second owner joins; raise to 1 then.)*
- [ ] 🧑 Turn on Dependabot alerts, secret scanning and push protection (**Settings → Code security**)
- [ ] 🧑 Create the GitHub Projects board (Backlog / Ready / In progress / In review / Done) and labels (`area:*`, `type:*`, `good first task`)

## Step 4: Local development environment (🤖)

- [x] `docker-compose.yml` with Postgres 17 (named volume, health check). Redis is left commented out for later
- [x] `.env.example` for server and client; server `env.ts` validates env with Zod at startup
- [x] `packages/db`: Drizzle config, first schema (`accounts`, `sessions`, `characters`), `db:generate`, `db:migrate`, `db:seed` scripts
- [x] `pnpm dev` starts Docker Postgres, runs migrations, then starts server and client together with hot reload (the server is a placeholder that checks the database until Step 5)
- [ ] A "Getting started" section in README that works on a fresh Windows PC (test it on the second owner's machine). *(Written; not yet tested on a second PC.)*

## Step 5: Single-player walking skeleton (🤖, several small PRs) — Phase 1

Each bullet is about one PR with its tests.

- [x] **Server shell:** Express + Colyseus in one process, `/healthz` and `/readyz`, pino logging, graceful shutdown, CORS and Helmet (#6)
- [x] **Protocol package:** `PROTOCOL_VERSION`, first Zod message schemas, shared `RuleResult` type (#7)
- [x] **Auth:** sign-up and login (argon2id, http-only session cookie), rate limiting, and `authenticateCookieHeader` for rooms in Phase 2. Integration tests (#8)
- [x] **Client shell:** Vite + React + Phaser, login screen, network client with protocol check (#9; WebSocket auto-reconnect arrives with rooms in Phase 2)
- [x] **Game API:** `GET /game/state` and `POST /game/actions` (shared schemas and rules, one transaction, idempotent `requestId`, rate limit) (#16; inventory and jobs join the state in #19)
- [x] **Movement and resume:** character on the map, click/keyboard movement, positions saved with bounds and speed checks; reload puts you back where you were (#17)
- [ ] **E2E in CI:** Playwright sign up → move → reload → still there → log out and in; CI boots the server with Postgres, serves the built client, uploads traces on failure (#18)

## Step 6: Staging deploy (🧑 accounts, then 🤖)

- [ ] 🧑 Create a **Railway** project with a Postgres database and connect the GitHub repo. Create a **Cloudflare** account and attach a domain. **Needed for login:** the session cookie is `SameSite=Lax`, so the client and server must share a site (e.g. `play.<domain>` and `api.<domain>`). On the free `*.pages.dev` + `*.up.railway.app` URLs the browser won't send the cookie to the server
- [ ] 🧑 Create **Sentry** (free) projects for client and server, and an uptime monitor on `/healthz`
- [ ] 🧑 Add secrets to the GitHub `staging` Environment and to Railway variables (`DATABASE_URL`, `SESSION_SECRET`, `SENTRY_DSN`, `CLIENT_ORIGIN`)
- [ ] 🤖 `apps/server/Dockerfile` (multi-stage, non-root user, small final image)
- [ ] 🤖 `.github/workflows/deploy-staging.yml`: on push to `main`, after CI passes, run migrations against staging, then deploy to Railway
- [ ] 🧑 Cloudflare Pages: build `apps/client` from `main` (staging) with PR previews; set `VITE_SERVER_URL`
- [ ] 🤖 Sentry SDK in client and server, with release tagging from the git SHA
- [ ] ✅ **Milestone:** both owners each play their single-player game on the staging URL from their own homes

## Step 7: Core game loop, single player (🤖, driven by design issues) — Phase 1

- [ ] Gather a resource on a timer: data tables, lazily resolved jobs with property tests, inventory UI (#19)
- [ ] Craft an item from a recipe: recipe data validated (inputs exist, no cycles), item conservation property test (#20)
- [ ] Trade with an NPC merchant: prices as data, gold and items conserved in one transaction (#21)
- [ ] Land plots and buildings (per-character in Phase 1)
- [ ] Basic round-based combat against NPCs
- [ ] Admin CLI: grant item, ban, inspect player, with all actions logged to `events`

## Step 8: Production readiness (before the first public playtest) — Phase 1

- [ ] 🧑 Production Railway environment and database, separate from staging. GitHub `production` Environment with required reviewer
- [ ] 🤖 `deploy-production.yml`: triggered by publishing a GitHub Release, with manual approval
- [ ] 🤖 Nightly `pg_dump` backup to Cloudflare R2 (GitHub Actions cron), 14-day retention. 🧑 test a restore
- [ ] 🤖 Load test: 100 simulated players sending actions. Record latency and CPU in `docs/perf/`
- [ ] 🧑 Privacy policy and terms page (required once strangers make accounts with emails)
- [ ] 🤖 Incident runbook `docs/RUNBOOK.md`: how to roll back a deploy, restore the DB, ban a player, put up maintenance mode

## Step 9: Multiplayer (🤖) — Phase 2

The same shared rules and database services as Phase 1, reached through Colyseus rooms as well as HTTP. Characters and their progress carry over.

- [ ] **RegionRoom:** join with the session cookie (`authenticateCookieHeader`), spawn at the saved position, `move.to` validated server-side, positions synced, region chat (#10)
- [ ] **WebSocket auto-reconnect** in the client network layer
- [ ] **Two-player E2E:** two browser contexts sign up, join the region, one moves and the other sees it, they exchange a chat message (#11)
- [ ] Per-character world data (resource nodes, merchant stock) moves to shared region-level tables
- [ ] Player market (order book, row locks, idempotent `requestId`), with property tests that items and gold are conserved
- [ ] Ranks, kingdoms, vassal links, councils and voting
- [ ] Chat profanity filter, report button, per-connection message rate limits
- [ ] Load test: 100 simulated players in one region

## Step 10: Scale when needed (not before)

- [ ] Redis + Colyseus Redis presence/driver to run more than one server process
- [ ] Sticky-session load balancing, with regions spread across processes
- [ ] Read replicas or caching for heavy read paths (market, leaderboards)

---

## Rough cost

| Stage | Monthly cost |
|---|---|
| Steps 0–5 (local + CI) | $0 (GitHub Actions is free for public repos) |
| Step 6 staging | ~$5–10 (Railway). Cloudflare Pages, Sentry and uptime monitoring are free |
| Step 8 production + staging | ~$15–30, plus about $10/year for a domain |
