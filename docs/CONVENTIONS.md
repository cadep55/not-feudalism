# Conventions

How we write code, use git, test, and keep the project safe. [AGENTS.md](../AGENTS.md) has the short version. This is the detail.

## 1. TypeScript and code style

- **Strict TypeScript everywhere:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`. Use `unknown` and narrow it, or write a Zod schema.
- **Biome** formats and lints. Don't argue with the formatter. `pnpm check` runs it, and the pre-commit hook fixes what it can.
- **ES modules**, named exports (no default exports, except where a tool requires them).
- **Naming:**
  - files `kebab-case.ts`, React components `PascalCase.tsx`
  - types and classes `PascalCase`, functions and variables `camelCase`, constants `SCREAMING_SNAKE_CASE`
  - game content IDs are `snake_case` strings (`iron_sword`, `wheat_field`)
- **Functions over classes** for game rules. Classes are fine where a framework expects them (Colyseus rooms, Phaser scenes).
- **Errors:** rules return result objects (`{ ok: true, state } | { ok: false, reason: "not_enough_gold" }`) instead of throwing for expected failures. Throw only for bugs. The `reason` codes are a shared union type, so the client can show a friendly message.
- **Comments explain *why*,** not what. Use `TODO(name):` or `TODO(design):` with a linked issue for anything deferred.
- **No dead code or commented-out blocks.** Git remembers.

## 2. Where code goes

| Kind of code | Location | Rules |
|---|---|---|
| Game rules (can I craft? what does it cost? who wins this round?) | `packages/shared/src/rules/` | Pure. Takes state, `now` and RNG as arguments. 100% unit-tested. |
| Balance and content data (items, recipes, ranks, timers) | `packages/shared/src/data/` | Plain typed objects, validated by a schema test. No logic. |
| Network message schemas and types | `packages/shared/src/protocol/` | Zod schemas, one file per domain. |
| Room handlers | `apps/server/src/rooms/` | Thin. Parse → load → call rule → persist → broadcast. |
| Business services (DB + rules) | `apps/server/src/services/` | Own the DB transactions. |
| HTTP routes | `apps/server/src/http/` | Thin. Same pattern as rooms. |
| DB schema and migrations | `packages/db/` | Changes only through `pnpm db:generate`. |
| Phaser scenes and sprites | `apps/client/src/game/` | No game rules here, only drawing and input. |
| React UI | `apps/client/src/ui/` | Reads from the client store and sends intents through the network client. |
| Network client | `apps/client/src/net/` | The only place that talks to the server. |
| Art and audio | `apps/client/public/assets/` | Use Git LFS for files over ~1 MB. Add credits to `ASSETS.md`. |

## 3. Git and GitHub

- **`main` is always deployable.** It's protected: PR required, CI must pass, one approving review, no force-push.
- **Branches:** `feat/12-bakery`, `fix/40-negative-trade`, `chore/`, `docs/`, `test/`, `refactor/`. Branch from fresh `main` and keep branches short-lived (days, not weeks).
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, in the imperative and under 72 characters. Scopes: `client`, `server`, `shared`, `db`, `economy`, `combat`, `land`, `social`, `infra`, `ci`, `docs`.
- **PRs:** fill in the template. Link the issue, list what you tested, and add screenshots or GIFs for UI changes. Squash-merge, so the PR title becomes the commit, which means the PR title must also be a Conventional Commit.
- **Issues:** use the templates (Feature, Bug, Task). Label them by area (`area:economy`) and type. Track everything on the GitHub Projects board (Backlog → Ready → In progress → In review → Done).
- **Releases:** tag `v0.MINOR.PATCH` on `main`. Publishing a GitHub Release deploys to production. Release notes are generated from PR titles.

## 4. Testing strategy

### The pyramid

| Layer | Tool | What it covers | Speed | Runs |
|---|---|---|---|---|
| **Unit** | Vitest | Every rule in `packages/shared`, utility functions, React components with logic | Milliseconds | Every save (watch mode), pre-push, CI |
| **Property** | fast-check (inside Vitest) | Economy invariants: gold and items are never created or destroyed by a trade; prices stay positive; crafting never yields negative stock | Fast | CI |
| **Data** | Vitest | Every recipe uses items that exist, no circular recipes, every rank is reachable, all IDs unique | Fast | CI |
| **Integration** | Vitest + `@colyseus/testing` + real Postgres | Room handlers and services end-to-end against a real DB: join, send intent, assert state and DB rows | Seconds | CI (Postgres service container) |
| **End-to-end** | Playwright | Real browser flows: sign up → gather → craft → sell. **Two-player tests** with two browser contexts: trade between players, chat, see each other move | Tens of seconds | CI on PRs, nightly full run |
| **Load** | Colyseus loadtest or k6 (later) | N simulated players in a region: message latency and server CPU | Minutes | Before each public playtest |

### Rules

- **Test behaviour, not implementation.** Assert on outcomes ("player has 1 sword and 3 less iron"), not on which functions were called.
- **Deterministic tests:** inject `now` and a seeded RNG. No real timers. Use `vi.useFakeTimers()` where a framework needs them. No `sleep` in tests, except Playwright's auto-waiting.
- **Integration tests use a real database,** reset between tests (each test inside a rolled-back transaction, or truncate tables). Don't mock the database.
- **Fixtures and builders:** `makeCharacter({ gold: 100 })` helpers in `packages/shared/test/builders.ts`, so tests stay short.
- **Coverage goals:** `packages/shared` ≥ 90% lines (CI enforces it); server services ≥ 70%; the UI is covered mostly by e2e.
- **Every bug fix starts with a failing test.**
- **Flaky tests are bugs.** Fix or quarantine them within a day (`test.fixme` with a linked issue). Never just retry until green.

### Example: a rule and its tests

```ts
// packages/shared/src/rules/craft.ts
export function startCraft(state: CharacterState, recipeId: RecipeId, qty: number, now: number): RuleResult<CharacterState> {
  const recipe = RECIPES[recipeId];
  if (!recipe) return fail("unknown_recipe");
  if (qty < 1 || qty > recipe.maxBatch) return fail("invalid_quantity");
  if (!hasItems(state.inventory, scale(recipe.inputs, qty))) return fail("missing_materials");
  // ...returns new state with materials removed and a job ending at now + recipe.durationMs * qty
}
```

```ts
// packages/shared/src/rules/craft.test.ts
it("rejects crafting without materials", () => {
  const state = makeCharacter({ inventory: {} });
  expect(startCraft(state, "iron_sword", 1, NOW)).toEqual({ ok: false, reason: "missing_materials" });
});
```

## 5. CI pipeline (GitHub Actions)

On every PR and push to `main`:

1. **Setup:** checkout, pnpm (via corepack), Node 24, cached pnpm store and Turborepo cache
2. **Lint and format:** `biome ci`
3. **Typecheck:** `turbo typecheck`
4. **Unit, property and data tests** with coverage
5. **Integration tests** with a Postgres service container: migrate, then test
6. **Build** every app
7. **E2E** (Playwright): boot the server and the built client, run smoke and two-player suites, and upload traces on failure

Also: **CodeQL** weekly and on PRs, **Dependabot** weekly with grouped minor/patch updates, and **secret scanning** on.

Deploy workflows:

- Merge to `main` → run migrations on staging → deploy the server to Railway staging → the client deploys automatically on Cloudflare Pages.
- Publish a GitHub Release → the same pipeline against production (with a manual approval step via a GitHub Environment).

## 6. Security and secrets

- `.env` files are git-ignored. `.env.example` lists every variable with fake values and a comment.
- Secrets live in GitHub Environments (`staging`, `production`), Railway variables and Cloudflare settings, never in code, issues, PRs or chat logs.
- If a secret is ever committed: **rotate it immediately** (deleting the commit isn't enough on a public repo), then clean history.
- Server rules from [ARCHITECTURE.md §8](ARCHITECTURE.md#8-security-checklist) apply to every handler.

## 7. Performance budgets (initial)

- Client first load under 3 MB (excluding cached art), interactive in under 3 s on a mid-range laptop.
- Server: handling a room message under 20 ms at p95. Any DB query over 50 ms gets an index or a rethink.
- 60 fps on the map with 50 visible players.

## 8. Accessibility and UX basics

- Every action reachable by mouse, with keyboard shortcuts for common ones.
- Text in React UI (not baked into canvas images) so it scales and can be translated later. Keep strings in one place.
- Colour is never the only signal (for example, low health also shows a number).
