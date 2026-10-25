# ADR 0003: Buildings and storehouse stock are per-player game state

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** cadep55

## Context

Until now each world had one storehouse and one house, fixed in a data table (`BUILDINGS`), and one pool of stored items per character. Issue #40 lets players build and remove houses and storehouses, and the owners decided that **each storehouse keeps its own stock** ([docs/design/buildings.md](../design/buildings.md)).

## Decision

- Buildings are **game state**: `GameState.buildings`, saved in a `buildings` table keyed by character and building id. The starting storehouse and house are data (`STARTING_BUILDINGS`), copied into each new world.
- Stored items are **per storehouse**: `GameState.storage` maps a storehouse id to its items, and `storehouse_items` gains a `building_id` column in its primary key.
- Villagers belong to a house (`villagers.house_id`), and a working villager's task names the storehouse it delivers to (`storehouseId`), so its timeline stays fixed while other buildings come and go.
- Existing characters were migrated in place: they got the starting buildings, their stored items went to the starting storehouse, their villagers to the starting house.

## Alternatives considered

- **One shared pool for all storehouses** (each adds capacity). Simpler, but the owners chose separate stock.
- **Keep buildings in data and mark which ones a player owns.** Doesn't allow building anywhere the player chooses.
- **Recompute each villager's storehouse on every read.** Building a nearer storehouse would then shift timelines that were already running and double-count or lose deliveries.

## Consequences

- Rules take buildings from state, not constants; anything that asks "where is the storehouse?" must say which one.
- The overflow rule (a load that doesn't fit goes to the next nearest storehouse) is accounted for without the villager walking there. Revisit if that looks wrong in play.
- Phase 2 (shared world) will need buildings to belong to a world or region as well as a player; the table can gain that column then.
