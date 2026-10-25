# Villagers

How villagers behave, and how the server works out what they did without running a loop. Owner decisions from 2026-10-24 (issue #31), plus the engineering rules that make them work. Change the decisions here first, then the code.

## Owner decisions

| Topic | Rule |
|---|---|
| How many | The house holds **3 villagers** (2–4 per house later) |
| Names | Each gets a **random medieval name** from a list in `packages/shared/src/data/villagers.ts`, shown above them and in the Villagers panel. Renaming comes later |
| Idle | Idle villagers **wander within 3 tiles of the house**, pausing a few seconds between strolls. **Visual only:** the server doesn't track idle positions |
| Assigning | A **Villagers panel** lists each villager with its status and a dropdown: Idle, Gather wood, Gather stone, Harvest wheat |
| Speed | Villagers gather at **1/3 of the player's speed**: 9 seconds per unit |
| Carrying | A villager carries **up to 5** (the carry limit), then walks to the storehouse and drops them off |
| Storehouse full | When a delivery doesn't fit (100 of that item), the villager **stops** and goes idle |
| Wheat | **Each farming villager needs its own rake**, taken from the storehouse when assigned and put back when unassigned |

## How the work is computed (no ticking)

Golden rule 5 says time-based things use timestamps, not loops. A villager's work is a **fixed, repeating timeline** that starts the moment it's assigned, so anyone (server or client) can work out where it is and how much it has delivered at any time.

**The places involved** (all tiles):

- **Door:** the tile just below the house (where villagers set out from)
- **Work spot:** the free tile next to the target (tree, rock or field) that's closest to the storehouse
- **Drop-off:** the free tile next to the storehouse that's closest to the work spot

**The timeline**, from `since` (when it was assigned):

1. Walk door → work spot (`w0` = distance ÷ walking speed)
2. Gather 5 units: `G` = 5 × 9 s = 45 s
3. Walk work spot → drop-off (`d` = distance ÷ walking speed), drop off 5
4. Walk back (`d`), then repeat from step 2

So delivery number `k` (1, 2, 3, …) lands at:

```
since + w0 + k × (G + 2d) − d
```

and the number of deliveries by time `t` is the largest `k` whose time is ≤ `t`. Distances are tile steps with diagonals (same as the player); walking speed is a data value.

**Settling:** whenever the server reads a character's state or applies an action, it first **settles** every working villager: deliveries made since the last settle go into the storehouse, in order, each one checked against the 100 cap. The villager remembers how many deliveries it has already handed in, so nothing is counted twice.

- **Wheat:** each delivered unit is a harvest from the villager's field, using the same harvest rules as the player (one wheat, a seed every 10th harvest). If the field runs out, the villager hands in what it got and goes idle (its rake goes back to the storehouse).
- **Full storehouse:** the villager hands in what fits, drops the rest, and goes idle.
- **Unassigning:** settles first, then the villager goes idle; anything it was partway through gathering is lost.

**Drawing:** the client runs the same timeline function to place working villagers (walking, gathering, dropping off), so they move smoothly with no server messages. Idle villagers wander on the client only.

## Not yet

- Buildings and fields don't block walking, so villagers walk in straight lines; pathfinding is #33
- Villagers don't eat, sleep, or need wheat; there's no growth from 2 to 4
- Renaming villagers
