# Medieval Strategy Game: Ideas and Plan

A shared doc for us to plan a multiplayer medieval strategy game inspired by Feudalism 2. Add ideas anywhere, comment on anything, and mark decisions in the Decisions section.

## Vision

A persistent online medieval world where each player starts as a peasant or small landholder and works up through a feudal hierarchy by farming, crafting, trading, fighting and politics. The game should be easy to start, slow to master, and built so players depend on each other.

## Core Gameplay Loop

1. Gather resources (farming, mining, woodcutting).
2. Craft goods and equipment.
3. Trade with other players or sell at markets.
4. Spend gold and resources on land, buildings, troops and gear.
5. Take part in conflicts, raids and politics to rise in rank.

## Feature Ideas

### Economy and Crafting

- Resource nodes with limited supply that regenerate over time
- Crafting professions (blacksmith, baker, carpenter, merchant)
- Player-run market with supply and demand pricing

### Land and Hierarchy

- Claimable land plots with buildings and upgrades
- Ranks from peasant to knight to lord to king
- Vassal and lord relationships with taxes and obligations

### Combat and Conflict

- Turn-based or timer-based battles (simpler to build first)
- Armies, sieges and castle defense
- Guilds or kingdoms that can declare war

### Social and Politics

- Chat channels, kingdom councils and voting
- Diplomacy: alliances, treaties and betrayals

## Open Questions

- Browser game, PC game or mobile?
- Real-time or turn-based/timer-based?
- Solo play, multiplayer or both?
- Art style: pixel art, 2D illustrated or 3D?
- Which game engine and language (for example Godot, Unity, or JavaScript for the web)?

Proposed answers to all of these are in [ADR 0001](docs/decisions/0001-tech-stack.md). "Solo or multiplayer" is answered: both, solo first ([ADR 0002](docs/decisions/0002-single-player-first.md)). The full setup plan is in [docs/INFRASTRUCTURE_PLAN.md](docs/INFRASTRUCTURE_PLAN.md).

## Roadmap

Two phases ([ADR 0002](docs/decisions/0002-single-player-first.md)). Accounts exist from the start, for login and saving progress, and that progress carries from Phase 1 into Phase 2.

### Phase 1: Single player, then a shared world

Started as each player alone in their own world; now players share one world of 10 sections, one each ([ADR 0004](docs/decisions/0004-shared-world.md)), still without real-time play.

- Player account, character and cloud-saved progress
- Basic map: walk around, come back where you left off
- Prototype loop: one resource, one crafting recipe, one trade with an NPC merchant
- Full single-player economy: several resources and recipes, NPC markets
- Build your own houses (5 wood) and storehouses (5 wood + 5 stone) ([#40](https://github.com/cadep55/not-feudalism/issues/40))
- A shared world of 10 sections with travel and a world view ([#47](https://github.com/cadep55/not-feudalism/issues/47))
- Coin, a market with an NPC trader, teams and trade caravans ([#47](https://github.com/cadep55/not-feudalism/issues/47))
- Land ownership and more buildings
- Basic combat against NPCs
- Put it online so both owners (then friends) can play their own games

### Phase 2: Multiplayer

The same game, shared with other players.

- Shared persistent world: see other players and play alongside them
- Chat, and a player-run market with supply and demand
- Ranks, kingdoms, vassals and diplomacy
- Councils and voting

### Then: Polish and Launch

- Art, sound and UI pass
- Balance testing with friends
- Public playtest

## Division of Work

| Area | Owner | Status |
|---|---|---|
| Game design and rules | TBD | Not started |
| Programming | TBD | Not started |
| Art and UI | TBD | Not started |
| GitHub repo and project board | TBD | Not started |

## GitHub Setup

- Create a shared repository and add both accounts as collaborators
- Use a main branch plus feature branches, merged by pull request
- Track tasks with GitHub Issues and a Projects board

## Decisions

Record agreed decisions here with the date.

- **2026-10-24:** Build **single player first, then multiplayer**. Accounts stay for login and saves. The server runs the game rules in both phases, so single-player progress carries into multiplayer. ([ADR 0002](docs/decisions/0002-single-player-first.md))
- **2026-10-24:** Character names are 3–16 characters, letters, digits and underscores, starting with a letter.
- **2026-10-24:** First resources: one **tree (wood)**, **rock (stone)** and **farm field (wheat)** on the heartland map. They never run out. Left-click to gather; each gather takes **3 seconds** and gives 1. Wheat needs a **rake**, the first tool, crafted from **2 wood + 1 stone**.
- **2026-10-24:** Crafting takes **3 seconds** and works **anywhere** (no workbench yet). It keeps going while you walk; gathering is cancelled if you walk away. One job at a time.
- **2026-10-24:** Characters face one of **8 directions** (the way they last stepped), shown by a faint arrow. **Gathering requires standing next to the node and facing it**; the same will apply to fighting.
- **2026-10-24:** One **storehouse** and one **house**, pre-placed as 2x2 squares. Players and villagers carry at most **5 of each item**; the storehouse holds **100 of each**.
- **2026-10-24:** Wheat fields hold **50 wheat + 5 wheat seeds** (every 10th harvest gives a seed) and disappear when empty. Plant a seed on the grass tile in front of you; it grows for **5 minutes**.
- **2026-10-24:** The house holds **3 villagers** with random medieval names. Idle ones wander near the house (visual only). Assign them from a Villagers panel; they gather at **1/3 player speed**, carry 5, and deliver to the storehouse until it's full. **Each farming villager needs its own rake.**
- **2026-10-25:** Players **build houses (5 wood) and storehouses (5 wood + 5 stone)** from their inventory in **10 seconds**, up to **5 houses and 3 storehouses**, with a clear tile on every side. Removing takes **5 seconds** and refunds the cost (to the inventory, then the nearest storehouse); a storehouse must be empty, and the last house and storehouse stay. Each new house brings 3 villagers. **Each storehouse keeps its own stock**; villagers deliver to the nearest, then the next nearest. ([docs/design/buildings.md](docs/design/buildings.md), #40)
- **2026-10-26:** Players **share one world of 10 sections**, one player per section (at most 10 players; the 11th waits). New players get a random free section; 3 east sections are partly water and 2 form an island (reachable once boats exist). Travel between sections at the middle of shared edges takes 5 seconds. Live multiplayer stays Phase 2. ([ADR 0004](docs/decisions/0004-shared-world.md), #47)

## Ideas Parking Lot

Anything that does not fit yet goes here.
