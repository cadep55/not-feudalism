# Buildings

How players build and remove houses and storehouses. Owner decisions from 2026-10-25 (issue #40), plus the engineering rules that make them work. Change the decisions here first, then the code.

## Owner decisions

| Topic | Rule |
|---|---|
| What | Players build **houses** and **storehouses**, both 2x2 |
| Cost | House: **5 wood**. Storehouse: **5 wood + 5 stone** |
| Paid from | The player's **inventory** only |
| Build time | **10 seconds**, timed like crafting |
| Limits | At most **5 houses** and **3 storehouses**, counting the starting ones |
| Placement | The footprint and **a clear tile on every side** must be on the map and free of buildings, resource nodes and fields, so there's always room to walk around |
| Moving | **No moving**: remove and rebuild |
| Removing | Any building can be removed. It takes **5 seconds** and **refunds the full cost** |
| Refunds | Go into the **inventory**; anything over the carry limit goes to the **nearest storehouse**. If it doesn't all fit, the removal is **refused** |
| Non-empty storehouse | Can't be removed until it's **empty** |
| Removed house | Its villagers **stop work, return their rakes, and leave** |
| Last of a kind | The **last house and the last storehouse can't be removed**: every world keeps at least one of each |
| New house | Brings **3 villagers**, like the starting house |
| Storage | **Each storehouse keeps its own stock**, up to 100 of each item |
| Villager deliveries | To the storehouse **nearest their work**; if it's full, the **next nearest**; when all are full, the villager **stops** |

## How it works

**Data** ([ADR 0003](../decisions/0003-player-buildings.md)): buildings live in game state (`GameState.buildings`) and in the `buildings` table, one row per building. Every world starts with the storehouse and house in `STARTING_BUILDINGS` (`packages/shared/src/data/buildings.ts`); characters made before players could build got them from migration `0012_starting_buildings`.

**Storage:** `GameState.storage` maps each storehouse's id to what it holds, and `storehouse_items` has a row per storehouse and item. Storing and taking work on the storehouse the character stands beside and faces.

**Villagers:** each villager belongs to a house (`houseId`) and sets out from its door. A working villager's task names the storehouse it walks to (`storehouseId`): the one nearest its work when it was assigned. Its timeline (see [villagers.md](villagers.md)) runs between that house and that storehouse. When a load doesn't fit there, the rest goes to the next nearest storehouse, and so on. The villager still walks to its own storehouse: the overflow is accounted for, not walked. If nothing fits anywhere, it stops.

Farming takes a rake from the nearest storehouse to the field that has one, and returns it to the villager's storehouse (or the first storehouse, if that one is gone).

## Not yet

- Building and removing (the actions, the Build tab and placement) arrive in the next PR of #40
- Buildings don't block walking yet; pathfinding is #33
