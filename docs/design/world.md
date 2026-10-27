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

## Not yet

- Joining the shared world, one section per player (#51)
- Travel between sections (#52)
- The world view (#53)
- Boats and docks (#48)
