import type { ItemId } from "./items.ts";
import type { RegionId } from "./world.ts";

// Buildings (owner decisions, 2026-10-24 and 2026-10-25; rules in docs/design/buildings.md).

/** Most of each item a character (or villager) can carry. */
export const CARRY_LIMIT = 5;

/** Most of each item one storehouse holds. Each storehouse keeps its own stock. */
export const STOREHOUSE_LIMIT = 100;

export const BUILDING_KINDS = ["storehouse", "house"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export function isBuildingKind(value: string): value is BuildingKind {
  return (BUILDING_KINDS as readonly string[]).includes(value);
}

/** A building in a character's world. Players build and remove them, so they live in game state. */
export type Building = {
  /** Unique within the character's world. */
  id: string;
  region: string;
  kind: BuildingKind;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** What each kind of building costs, paid from the character's inventory. */
export const BUILD_COSTS: Record<BuildingKind, Partial<Record<ItemId, number>>> = {
  house: { wood: 5 },
  storehouse: { wood: 5, stone: 5 },
};

/** How long building takes. */
export const BUILD_DURATION_MS = 10_000;

/** How long removing a building takes. Removing refunds its full cost. */
export const REMOVE_DURATION_MS = 5_000;

/** Most of each kind a character may have, counting the starting ones. */
export const BUILDING_LIMITS: Record<BuildingKind, number> = { house: 5, storehouse: 3 };

/** Footprint size of each kind of building, in tiles. */
export const BUILDING_SIZES: Record<BuildingKind, { width: number; height: number }> = {
  storehouse: { width: 2, height: 2 },
  house: { width: 2, height: 2 },
};

type StartingBuilding = Building & { region: RegionId };

/** The storehouse every new world starts with. */
export const STARTING_STOREHOUSE: StartingBuilding = {
  id: "heartland_storehouse",
  region: "heartland",
  kind: "storehouse",
  x: 15,
  y: 8,
  ...BUILDING_SIZES.storehouse,
};

/** The house every new world starts with. */
export const STARTING_HOUSE: StartingBuilding = {
  id: "heartland_house",
  region: "heartland",
  kind: "house",
  x: 5,
  y: 12,
  ...BUILDING_SIZES.house,
};

/**
 * The buildings every new player starts with, as placed in heartland. (Their
 * ids date from when every player lived there.)
 */
export const STARTING_BUILDINGS: readonly StartingBuilding[] = [
  STARTING_STOREHOUSE,
  STARTING_HOUSE,
];

/** A new player's starting buildings, placed in their home section. Every reachable section fits them. */
export function startingBuildings(region: string): Building[] {
  return STARTING_BUILDINGS.map((b) => ({ ...b, region }));
}

/** Every tile a building covers. */
export function footprint(building: Building): { x: number; y: number }[] {
  const tiles = [];
  for (let dy = 0; dy < building.height; dy++) {
    for (let dx = 0; dx < building.width; dx++) {
      tiles.push({ x: building.x + dx, y: building.y + dy });
    }
  }
  return tiles;
}

export function covers(building: Building, tile: { x: number; y: number }): boolean {
  return (
    tile.x >= building.x &&
    tile.x < building.x + building.width &&
    tile.y >= building.y &&
    tile.y < building.y + building.height
  );
}
