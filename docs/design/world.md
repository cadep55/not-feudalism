# The world

The shared world: its sections, terrain, resources and the travel zones between sections. Owner decisions from issue #47 (2026-10-25/26) and [ADR 0004](../decisions/0004-shared-world.md). Change the decisions here first, then the code.

## Owner decisions

| Topic | Rule |
|---|---|
| Sections | **10 sections**, one player each, at most **10 players** (the 11th waits) |
| Water | **3 east sections are partly water.** Players can't walk, build or plant on water. Boats and docks come later (#48) |
| Island | **2 sections form an island**: water on 3 sides each, joined to each other by land. Unreachable until boats exist |
| Resources | **Every section has its own** tree and rock (and starting field for its owner) |
| Travel | A **travel zone in the middle of each shared edge**. Standing on it shows a faint rectangle and loads for **5 seconds**, then moves you to the next section. **Free** |
| Joining | New players get a **random free section** they can reach |
| World view | A zoomed-out view, opened from the bottom bar next to Build; look only for now |

## Layout

All data lives in `packages/shared/src/data/world.ts` (`REGIONS`, `CONNECTIONS`, `travelZonesIn`, `isWater`).

```
[northwest] [north]     [northeast_coast~]
[west]      [heartland] [east_coast~]        [north_isle]
            [south]     [southeast_coast~]   [south_isle]
```

- Every section is **25 × 18** tiles.
- `~` sections: the four eastern columns (x 21 to 24) are sea, narrow enough that every reachable section has room for the same starting base, with the tree and rock in the same spots.
- The isles: three rows of sea on the outer side (north for the north isle, south for the south isle) and three columns on each side. They join each other along their shared edge.
- **Connections** join sections next to each other on the grid. The island joins only itself, so it can't be walked to.
- A **travel zone** is the 3 tiles in the middle of a shared edge (x 11 to 13 on top and bottom edges, y 7 to 9 on the sides).
- **Resources:** a tree and a rock in every section (`<section>_tree`, `<section>_rock`), never next to water. A villager gathers from the tree or rock in its own section.

The section names, the coastline and island shapes, and where resources stand are placeholders (`TODO(design)`).

## Joining

- Sign-up joins the **main world** and gives the player a **random free reachable section** as their home (`characters.home_region`). The world row is locked while picking, so two sign-ups can't take the same section, and a unique index backs that up.
- The starting base (storehouse, house, field, spawn point) is placed in that section at the same spots in every section.
- When no reachable section is free, sign-up is refused: "The world is full" (`world_full`). That is how the 11th player waits for now; until boats exist the island stays empty, so the world fills at 8.
- Players build and plant only in their **home section** (`not_your_section`); allies building in each other's sections comes with teams (#55).
- A character without a section (only possible for characters made before sections were shared) is told the world is full when loading the game. When sections arrived, the oldest character kept heartland and any others waited.

**Tests:** integration tests sign up with `TEST_WORLD` (`apps/server/src/test-world.ts`): a brand-new world per sign-up, starting in heartland. The e2e tests play in the dev server's main world and delete the players they create after each test (`e2e/tests/cleanup.ts`).

## Travel

- Standing still on a travel zone (with the server agreeing where you stand) starts a **5-second trip** (`travel.start`, a timed job like gathering). A faint rectangle shows over the zone while you're on it.
- **Stepping off cancels** the trip; turning doesn't. Nothing else can be going on (busy otherwise).
- You arrive **one tile inside** the next section, across from where you left, so you don't land on its zone and head straight back. The map reloads for the new section.
- **Other players' bases:** in someone else's section you see their buildings (labelled with their name) and fields. You can't use them.
- **Travel zones stay open:** no building's footprint or clear ring may cover a zone tile.

## Not yet

- The world view (#53)
- Boats and docks (#48)
