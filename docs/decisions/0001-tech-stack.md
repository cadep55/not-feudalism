# ADR 0001: Tech stack and multiplayer model

- **Status:** Proposed (accept by changing this to "Accepted" and adding the date and both owners' names)
- **Date:** 2026-10-23
- **Deciders:** cadep55, second owner TBD

## Context

[GUIDE.md](../../GUIDE.md) leaves these open: platform, real-time vs turn-based, solo vs multiplayer, art style, and engine/language. We want a persistent online world that two people (with AI agents helping) can build, test and host cheaply, and that friends can join with no install.

## Decision

| Question | Answer | Main reason |
|---|---|---|
| Platform | **Browser first** (desktop browsers). Can be wrapped for PC (Electron/Tauri) or mobile later | No install, so playtesting with friends is one link. One codebase |
| Real-time or turn-based | **Timer-based actions + real-time presence and chat. Round-based battles** | Persistent world that runs while offline, cheap server, fair on slow connections. Real-time combat can be added later |
| Solo or multiplayer | **Multiplayer-first** (shared persistent world) | The game is about players depending on each other |
| Art style | **2D pixel art** (16×16 or 32×32 tiles) | Cheapest to make, works well with Phaser, fits the Feudalism feel |
| Language | **TypeScript** end to end | One language for client, server and shared rules. AI agents are strong at it |
| Game engine | **Phaser** for the map and sprites, **React** for UI | Mature 2D web engine. React is better for menu-heavy screens (inventory, market, chat) |
| Multiplayer server | **Colyseus** on Node.js, with Express for HTTP | Authoritative rooms, automatic state sync, matchmaking, Redis scaling path, made for TypeScript |
| Database | **PostgreSQL + Drizzle ORM** | Transactions for a cheat-proof economy. Typed schema and committed migrations |
| Monorepo | **pnpm workspaces + Turborepo** | Shared code between client and server, fast cached builds |
| Testing | **Vitest, fast-check, @colyseus/testing, Playwright** | Fast unit tests, economy invariants, real room tests, two-browser multiplayer e2e |
| Lint/format | **Biome** | One fast tool and one config instead of ESLint + Prettier |
| Hosting | **Cloudflare Pages** (client), **Railway** (server + Postgres) | Free/cheap, deploy from GitHub, WebSocket support |

## Alternatives considered

- **Godot (GDScript/C#):** great 2D editor and a native PC build. But it means a second language for the server (or Godot's headless server), harder web deploys and weaker test tooling. A good choice if we decide the game must be a downloadable PC game.
- **Unity:** heavy for 2D, licensing worries, and multiplayer needs paid or third-party services.
- **Plain WebSockets (`ws`/Socket.IO) instead of Colyseus:** fewer concepts, but we would rebuild state sync, rooms and reconnection ourselves.
- **Supabase / Firebase as the backend:** fast to start, but game logic must be authoritative and server-side. Realtime database rules aren't a good fit for an economy that must resist cheating.
- **Fully real-time combat:** more fun for action fans, but much harder (lag compensation, server tick loop) and more expensive to host. Deferred.

## Consequences

- Everyone works in TypeScript, and game rules are shared and unit-testable without a browser.
- The browser limits us to 2D/light graphics. That's fine for pixel art.
- Colyseus is a smaller ecosystem than Socket.IO, but it's stable and purpose-built. If it ever blocks us, rooms are thin wrappers around shared rules and services, so swapping the transport is contained.
- Revisit this ADR if we decide on a native PC/mobile release, or on real-time action combat.
