import { type Building, type BuildingKind, covers, footprint } from "../data/buildings.ts";
import { RESOURCE_NODES } from "../data/resources.ts";
import { isRegionId, isWater, REGIONS } from "../data/world.ts";
import { tileInFront } from "../game/direction.ts";
import type { GameState } from "../game/state.ts";
import { tileDistance } from "./move.ts";

type Tile = { x: number; y: number };

/** The character's buildings of one kind, in the order they were built. */
export function buildingsOf(state: GameState, kind: BuildingKind): Building[] {
  return state.buildings.filter((b) => b.kind === kind);
}

export function buildingById(state: GameState, id: string): Building | null {
  return state.buildings.find((b) => b.id === id) ?? null;
}

/** The building on a tile of the region, if any. */
export function buildingAt(buildings: Building[], region: string, tile: Tile): Building | null {
  return buildings.find((b) => b.region === region && covers(b, tile)) ?? null;
}

/** Steps (diagonals included) from a tile to the nearest tile of a building's footprint. */
export function distanceToBuilding(tile: Tile, building: Building): number {
  return Math.min(...footprint(building).map((t) => tileDistance(tile, t)));
}

/** The storehouse the character stands beside and faces, or null. */
export function storehouseInFront(state: GameState): Building | null {
  const { character } = state;
  const ahead = tileInFront(character, character.facing);
  for (const building of buildingsOf(state, "storehouse")) {
    if (building.region !== character.region || covers(building, character)) continue;
    if (covers(building, ahead)) return building;
  }
  return null;
}

/** Storehouses in the region, nearest to the tile first (ties keep build order). */
export function storehousesByDistance(
  buildings: Building[],
  region: string,
  tile: Tile,
): Building[] {
  return buildings
    .filter((b) => b.kind === "storehouse" && b.region === region)
    .map((b, order) => ({ b, order, d: distanceToBuilding(tile, b) }))
    .sort((a, z) => a.d - z.d || a.order - z.order)
    .map(({ b }) => b);
}

/** True when nobody can stand on the tile: off the map, water, a building, or a resource node. */
export function isBlocked(buildings: Building[], region: string, tile: Tile): boolean {
  if (!isRegionId(region)) return true;
  const size = REGIONS[region];
  if (tile.x < 0 || tile.y < 0 || tile.x >= size.width || tile.y >= size.height) return true;
  if (isWater(region, tile) || buildingAt(buildings, region, tile)) return true;
  return Object.values(RESOURCE_NODES).some(
    (n) => n.region === region && n.x === tile.x && n.y === tile.y,
  );
}

/** The tile just below a house, where its villagers set out from. */
export function houseDoor(house: Building): Tile {
  return { x: house.x, y: house.y + house.height };
}
