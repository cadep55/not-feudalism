# ADR 0002: Single player first, with the server running the rules

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** cadep55

## Context

The plan in [ADR 0001](0001-tech-stack.md) went straight to a shared multiplayer world. The owners want a playable game sooner, so development is split into two phases:

1. **Phase 1, single player:** each player plays alone in their own persistent world.
2. **Phase 2, multiplayer:** a shared world with other players, chat, a player market, ranks and kingdoms.

Accounts and login stay in Phase 1, for logging in and saving progress. The open question was where single-player game rules run:

- in the browser, with the server only storing save files, or
- on the server, with the browser sending actions.

## Decision

**The server runs the rules in both phases.** In Phase 1 the client talks to the server over plain HTTP:

| Route | Does |
|---|---|
| `GET /game/state` | The logged-in character's state: position, gold, inventory, active jobs |
| `POST /game/actions` | One intent `{ type, payload, requestId }`. The server validates it with the shared Zod schema, applies the pure rule from `packages/shared` in one database transaction, and returns the new state |

- **Idempotent actions:** a repeated `requestId` returns the earlier result, so double-clicks and retries never apply twice.
- **Movement:** the client animates walking locally and sends `move.to` positions in batches. The server checks map bounds and plausible speed from the last saved position and time.
- **Timers:** gathering, crafting and travel are jobs with `startedAt` and `completesAt`, resolved when read (golden rule 5). Jobs finish while the player is offline.
- **Progress lives in Postgres,** not in a save file. Nothing is lost if the browser closes.
- **Colyseus stays in the server** but carries no rooms until Phase 2.

## Alternatives considered

- **Browser runs the game, server stores save files:** fastest to build and tolerant of bad connections. But saves can be edited, so single-player progress could never be trusted in the shared world. Moving to Phase 2 would mean rewriting the game logic around a server, or wiping everyone's progress.
- **Colyseus rooms from day one, one room per player:** works, but a WebSocket per player adds reconnection and room lifecycle work that single player doesn't need. HTTP is simpler to build, test and debug, and the same rules plug into rooms later.

## Consequences

- **Phase 2 adds transport, not rewrites:** rooms (#10) call the same shared rules and the same database services that `/game/actions` uses. Characters and their progress carry over.
- **Golden rule 1 holds from day one:** the client sends intents, never results. Cheating in single player gains nothing in multiplayer.
- **Every action is a round trip.** A timer-based game tolerates that; the client shows a short "working" state. Real-time combat, if wanted, is a Phase 2 room concern.
- **Single-player worlds are per character:** each character has its own resource nodes and merchant stock. In Phase 2, regions become shared and that data moves to region-level tables.
