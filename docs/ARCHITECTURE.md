# Architecture

How Not Feudalism fits together: the pieces, how players talk to the server, how state is stored, and how it's hosted. The stack is **Proposed** in [ADR 0001](decisions/0001-tech-stack.md).

## 1. Big picture

```
                 ┌─────────────────────────── Browser ───────────────────────────┐
                 │  apps/client                                                  │
                 │  React (menus, HUD, chat)  ⇄  Phaser (map, sprites, effects)  │
                 │            uses packages/shared (rules, types, schemas)       │
                 └───────────┬──────────────────────────────┬────────────────────┘
                     HTTPS (REST)                     WebSocket (Colyseus)
                 login, account, static data          live world, chat, battles
                             │                              │
                 ┌───────────▼──────────────────────────────▼────────────────────┐
                 │  apps/server  (one Node.js process to start)                  │
                 │  Express routes  ·  Colyseus rooms  ·  game services          │
                 │            uses packages/shared + packages/db                 │
                 └───────────┬───────────────────────────────────────────────────┘
                             │ SQL (Drizzle)
                 ┌───────────▼───────────┐        later: Redis (presence, pub/sub
                 │      PostgreSQL       │        for more than one server process)
                 └───────────────────────┘
```

- **Client (`apps/client`):** a static site. Phaser draws the world (tile map, characters, animations). React draws everything that's mostly text and buttons (inventory, market, chat, menus). The two talk through a small event bus or store, not by reaching into each other.
- **Server (`apps/server`):** the single source of truth. Express handles plain request/response things (sign-up, login, fetching static data). Colyseus handles live, pushed state (who's on the map, chat, battles, market updates).
- **Shared (`packages/shared`):** game rules, data tables, TypeScript types and Zod schemas. Pure code that runs identically in the browser and on the server.
- **DB (`packages/db`):** Drizzle schema, migrations and seed data. Only the server imports it.

## 2. Game model

### Phase 1: single player over HTTP

Development starts with single player ([ADR 0002](decisions/0002-single-player-first.md)). Everything in this section still applies, except the transport: instead of rooms, the client calls two HTTP routes.

| Route | Does |
|---|---|
| `GET /game/state` | The logged-in character's state: position, gold, inventory, active jobs |
| `POST /game/actions` | One intent `{ type, payload, requestId }`: Zod-parse, load state, run the shared rule, save in one transaction, return the new state |

Each character has its own world (resource nodes, merchant stock). The services behind `/game/actions` are the same ones rooms will call in Phase 2, so only the transport is added later.

### Phase 2: multiplayer

The shared world. The rules, data model and services below apply from Phase 1; rooms and broadcasting are added in Phase 2.

#### Authoritative server, intent-based protocol

The client never decides outcomes. It sends **intents**, and the server validates and applies them:

```
client  ── { type: "craft.start", recipeId: "iron_sword", qty: 1 } ──▶  server
                                                                         1. Zod-parse the message
                                                                         2. Load player state
                                                                         3. shared.rules.canCraft(state, recipe, now)
                                                                         4. Write to DB in a transaction
                                                                         5. Update room state
client  ◀── state patch (inventory, job with completesAt) ─────────────  server (to everyone who should see it)
```

The client may *predict* a result to feel snappy (for example, greying out the materials straight away) but must accept whatever the server sends back.

#### Timer-based world with real-time presence (recommended answer to "real-time or turn-based?")

- **Actions take real time:** farming, crafting, travelling, building and training troops are jobs with `startedAt` and `completesAt`. Progress is computed from the clock (`progress = (now - startedAt) / duration`), never ticked.
- **Lazy resolution:** a job is resolved when anyone looks at it (the player logs in, opens the screen, or another system needs it), or by a lightweight scheduler that wakes for the next due job. Resource nodes regenerate the same way: store `lastHarvestedAt` and compute the current amount on read.
- **Presence and chat are real time:** players see each other move on the map and chat live through Colyseus rooms.
- **Battles start turn-based or round-based on a timer** (for example, one round every 10 seconds). That's simpler to build and fair to slow connections. A real-time combat room can come later without changing the rest of the design.

This gives a persistent world that keeps running while players are offline, at very low server cost.

#### Rooms

| Room | Who joins | Holds |
|---|---|---|
| `RegionRoom` (one per map region) | Players currently in that region | Positions, visible buildings, nearby players, region chat |
| `KingdomRoom` | Members of a kingdom or guild | Council chat, votes, treasury summary |
| `BattleRoom` (created on demand) | Participants and spectators | Battle state, rounds, results |
| `MarketRoom` | Anyone viewing the market | Order book, price ticker |

Room state only holds what's needed to draw the screen. **The database is the durable truth**, so a room can crash and be rebuilt from the DB.

#### Messages

- Every client→server message type is a Zod schema in `packages/shared/src/protocol/`, named `domain.verb` (`trade.offer`, `craft.start`, `move.to`).
- Server→client updates come through Colyseus state sync (automatic diffs), plus occasional one-off events (`toast`, `battle.result`).
- Messages are versioned with a `PROTOCOL_VERSION` constant. The client shows "please refresh" when it doesn't match the server's.

## 3. Data model (first pass)

Plural table names, `snake_case` columns, UUID primary keys and `created_at`/`updated_at` on everything.

| Table | Purpose |
|---|---|
| `accounts` | Login identity: email, password hash, created_at, banned_at |
| `sessions` | Login sessions (http-only cookie token, expiry) |
| `characters` | One per account to start: name, rank, gold, region, position |
| `items` | Item definitions *if* they become editable at runtime; otherwise these stay as data tables in `shared` |
| `inventories` | character_id, item_id, quantity (unique on character + item) |
| `jobs` | Timed actions: character_id, kind, payload (JSON), started_at, completes_at, resolved_at |
| `land_plots` | Region, coordinates, owner_character_id, buildings (JSON or child table) |
| `market_orders` | Buy/sell orders: item, price, quantity, side, status |
| `trades` | Completed trades (audit log) |
| `kingdoms`, `kingdom_members` | Hierarchy: lord/vassal links, roles, tax rate |
| `game_actions` | Every action a character sent and the result it got, keyed by `(character_id, request_id)`. Makes retries safe (idempotency) and doubles as an audit log |
| `events` | Append-only audit log of important game actions (good for debugging cheating and balance) |

Rules for data:

- **Money and quantities are integers.** Store gold as an integer number of the smallest coin. Never use floats for currency.
- **Anything that moves value is one transaction.** For example, a trade debits one player and credits another in one DB transaction with row locks (`SELECT … FOR UPDATE`), so items can never be duplicated.
- **Idempotency:** intents that change value carry a client-generated `requestId`. The server ignores repeats, so a double-click can't buy twice.

## 4. Auth and accounts

- Email + password to start. Hash passwords with **argon2id**. Sessions use a random token in an **http-only, Secure, SameSite=Lax cookie**.
- The WebSocket join checks the same session (Colyseus `onAuth`).
- Add "Sign in with Discord" later. It suits a gaming audience and avoids handling passwords at all.
- Rate-limit login, sign-up and chat. Add a profanity filter and a report button to chat before any public playtest.

## 5. Environments

| Environment | Purpose | Deployed when | Data |
|---|---|---|---|
| **local** | Development on your PC | You run `pnpm dev` | Docker Postgres with seed data; reset whenever |
| **preview** | Check a PR's client visually | Every PR (Cloudflare Pages preview URL) | Points at staging server |
| **staging** | Playtesting with friends, testing deploys | Every merge to `main` | Separate staging database; can be wiped |
| **production** | Real players | Manually, by publishing a GitHub Release (tag `v0.x.y`) | Real data, backed up daily |

Config comes from environment variables only, validated at startup with a Zod schema in `apps/server/src/env.ts`. The server refuses to start if something is missing.

## 6. Hosting

**Recommended starting setup (cheap, simple, handles our first few hundred players):**

| Piece | Host | Why |
|---|---|---|
| Client (static files) | **Cloudflare Pages** | Free, global CDN, automatic PR previews, deploys from GitHub |
| Game server | **Railway** (Docker deploy from GitHub) | Supports long-lived WebSockets, simple dashboard, around $5–20/month to start |
| PostgreSQL | **Railway Postgres** (same project) | One dashboard. Automated backups on paid plans, and we also run our own nightly `pg_dump` |
| Domain + DNS | Cloudflare | Free DNS. `play.<domain>` for the client, `api.<domain>` for the server |
| Errors | **Sentry** (free tier) | Client and server crash reports with stack traces |
| Uptime | **Better Stack** or UptimeRobot (free) | Pings `/healthz` and alerts on Discord or email |

Alternatives if Railway doesn't suit us: **Fly.io** (more control, multiple regions), **Render**, or a $5–10 VPS (Hetzner/DigitalOcean) running Docker Compose with Caddy for HTTPS (cheapest at scale, more work for us).

**Scaling path, only when needed:**

1. One server process (handles hundreds of concurrent players for a timer-based game).
2. Bigger machine. Add DB indexes, and cache static data.
3. Several server processes: add **Redis** with Colyseus's Redis presence/driver so rooms can live on different processes, behind a load balancer with sticky sessions.
4. Split regions across processes or machines.

The server must stay **stateless apart from live rooms** (all durable state in Postgres), so step 3 needs no rewrite.

## 7. Observability and operations

- **Logs:** structured JSON with `pino`, including `requestId`, `characterId` and `room` on every line. Never log passwords, tokens or emails.
- **Health:** `GET /healthz` (process up) and `GET /readyz` (DB reachable). The host restarts the server when these fail.
- **Metrics (later):** concurrent players, rooms, message rate, DB query time. Start with Railway's built-in graphs.
- **Backups:** nightly `pg_dump` to cheap object storage (Cloudflare R2), kept 14 days. **Test a restore once a month.**
- **Graceful shutdown:** on deploy, the server stops accepting joins, tells clients "server restarting", saves room state and exits. Clients reconnect automatically.
- **Admin tools:** a protected admin route or CLI for ban, refund and item grants, and every admin action goes into `events`.

## 8. Security checklist

- Validate every input with Zod on the server, including types, ranges, lengths and enum values. Reject negative or huge quantities.
- Re-check permissions in every handler (is this your item, your land, your kingdom?).
- Rate limits per account and per IP on HTTP, plus per-connection limits on WebSocket messages.
- Set CORS to the client origin only. Use Helmet security headers and HTTPS everywhere.
- Turn on GitHub Dependabot alerts and secret scanning (free for public repos), and keep CodeQL running in CI.
- Use parameterised queries only (Drizzle does this; never build SQL with string concatenation).
- Server-side chat filtering and moderation tools before the public playtest.
