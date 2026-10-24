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

Proposed answers to all of these are in [ADR 0001](docs/decisions/0001-tech-stack.md). The full setup plan is in [docs/INFRASTRUCTURE_PLAN.md](docs/INFRASTRUCTURE_PLAN.md).

## Roadmap

### Phase 1: Prototype

- Pick platform, engine and art style
- Player account, character and basic map
- One resource, one crafting recipe, one trade action

### Phase 2: Core Systems

- Full economy: several resources, recipes and a market
- Land ownership and buildings
- Basic combat

### Phase 3: Multiplayer and Politics

- Online play with a shared persistent world
- Ranks, kingdoms and diplomacy
- Chat and voting

### Phase 4: Polish and Launch

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

## Ideas Parking Lot

Anything that does not fit yet goes here.
