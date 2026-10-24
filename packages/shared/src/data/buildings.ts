import type { RegionId } from "./world.ts";

// Buildings (owner decisions, 2026-10-24: one storehouse and one house, pre-placed, 2x2).

/** Most of each item a character (or villager) can carry. */
export const CARRY_LIMIT = 5;

/** Most of each item the storehouse holds. */
export const STOREHOUSE_LIMIT = 100;

export type Building = {
  region: RegionId;
  kind: "storehouse" | "house";
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export const BUILDINGS = {
  heartland_storehouse: {
    region: "heartland",
    kind: "storehouse",
    x: 15,
    y: 8,
    width: 2,
    height: 2,
  },
  heartland_house: { region: "heartland", kind: "house", x: 5, y: 12, width: 2, height: 2 },
} as const satisfies Record<string, Building>;

export type BuildingId = keyof typeof BUILDINGS;

export const BUILDING_IDS = Object.keys(BUILDINGS) as [BuildingId, ...BuildingId[]];

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
