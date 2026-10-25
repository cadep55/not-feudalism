import { CARRY_LIMIT } from "./buildings.ts";
import { WALK_SPEED_TILES_PER_SECOND } from "./movement.ts";
import { GATHER_DURATION_MS } from "./resources.ts";

// Villagers (owner decisions, 2026-10-24; full rules in docs/design/villagers.md).

/** Villagers each house holds (2-4 per house later). */
export const VILLAGERS_PER_HOUSE = 3;

/** Villagers gather at 1/3 of the player's speed. */
export const VILLAGER_GATHER_MS = GATHER_DURATION_MS * 3;

/** Units a villager gathers before walking to the storehouse (the carry limit). */
export const VILLAGER_LOAD = CARRY_LIMIT;

// TODO(design): how fast villagers walk; for now, as fast as the player.
export const VILLAGER_WALK_TILES_PER_SECOND = WALK_SPEED_TILES_PER_SECOND;

/** Idle villagers wander within this many tiles of the house (drawn by the client only). */
export const WANDER_RADIUS = 3;

/** Names villagers are given at random. */
export const VILLAGER_NAMES = [
  "Aldric",
  "Maud",
  "Osric",
  "Edith",
  "Godwin",
  "Agnes",
  "Wulfric",
  "Matilda",
  "Ranulf",
  "Isolde",
  "Baldwin",
  "Hilda",
  "Cedric",
  "Rowena",
  "Leofric",
  "Elswyth",
] as const;

/** What a villager can be told to do in the Villagers panel. */
export const VILLAGER_JOBS = ["idle", "wood", "stone", "wheat"] as const;
export type VillagerJob = (typeof VILLAGER_JOBS)[number];
