# ADR 0004: A shared world of sections replaces private worlds

- **Status:** Accepted
- **Date:** 2026-10-26
- **Deciders:** cadep55
- **Supersedes:** the "each player has their own world" part of [ADR 0002](0002-single-player-first.md). The rest of ADR 0002 stands: the server runs every rule, over HTTP.

## Context

Until now every player had a private copy of one map ("heartland"). The owners want players to share a world now (issue #47): send trade caravans to each other's bases, form teams, and later fight and claim sections. They decided:

- One world of **10 sections**, **one player per section**, so at most **10 players**. The 11th player **waits**.
- 3 sections on the east are partly water, and 2 form an island that can't be reached until boats exist (#48).
- New players get a **random free section**. Existing players keep their base as their section.

Live multiplayer (seeing each other move in real time, chat) is still Phase 2.

## Decision

**A world is a set of sections shared by its players, still played over HTTP with timed actions.**

| Thing | Where it lives |
|---|---|
| Sections: size, terrain (grass or water), resources, connections, travel zones | Data tables in `packages/shared/src/data/` (the same for every world) |
| Worlds | A `worlds` table. The game uses one main world |
| Which world a player is in, and their home section | `characters.world_id` and `characters.home_region`, unique per world |
| Where a player stands | `characters.region`, `x`, `y`, as before; travel changes `region` |
| Buildings, fields, villagers, storage | Still owned by the player. Buildings and fields sit in a section (their `region`) |

Rules that follow:

- **Joining:** sign-up puts the player in a random free section the player can reach (the island stays empty until boats exist, so 8 sections are open for now). When none is free, sign-up is refused with "the world is full": that is how the 11th player waits for now.
- **Home section:** a player builds, plants and keeps villagers only in their home section. (Allies building in each other's sections comes with teams, #55.) Resource nodes in any section can be gathered by anyone who is there.
- **Seeing others:** when you stand in another player's section, the server sends their buildings and fields so you can see them. You can't use their storehouse.
- **Settling** stays per player and lazy: reading your state settles your jobs and villagers. Things that cross players (caravans, #56) settle when either side's state is read.

**Tests get their own worlds.** The integration tests create a fresh world per test file, so they never fill the main world, however many players they sign up. The end-to-end tests run against the dev server's main world, so they delete the players they create after each test. The local database was cleaned of 487 old test accounts once, by hand, when this landed.

## Alternatives considered

- **Wait for Phase 2.** Caravans, teams and section claiming need other players' bases, and none of that needs real-time rooms, so waiting would only delay it.
- **Each player keeps a private copy of every section.** No way to reach another player's base.
- **No cap, many players per section.** The owners want sections to be claimable later, which needs one owner per section.
- **Sharing one database world between tests and play.** Tests sign up dozens of players per run and would fill a 10-player world immediately.

## Consequences

- Game state still loads per player, plus a read of the other players in the section you stand in.
- The world fills at 8 players until boats open the island, then 10.
- Phase 2 adds real-time rooms per section on top of this; the data model doesn't need to change for that.
- A waiting list (rather than refusing sign-up) can come later if the world fills up in practice.
