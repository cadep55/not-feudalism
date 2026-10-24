import {
  BUILDING_IDS,
  BUILDINGS,
  type Building,
  type BuildingId,
  covers,
  type Direction,
  tileDistance,
  tileInFront,
} from "@nf/shared";
import { nodeAt } from "./gathering.ts";
import type { RegionSize, Tile } from "./movement.ts";

/** Straight directions first, so the tile in front is a side of the footprint when possible. */
const FACING_PREFERENCE: readonly Direction[] = ["n", "e", "s", "w", "ne", "se", "sw", "nw"];

/** The buildings drawn on a region's map. */
export function buildingsIn(region: string): BuildingId[] {
  return BUILDING_IDS.filter((id) => BUILDINGS[id].region === region);
}

/** The building covering a tile, or null when the tile is open ground. */
export function buildingAt(tile: Tile, region: string): BuildingId | null {
  return buildingsIn(region).find((id) => covers(BUILDINGS[id], tile)) ?? null;
}

/** Steps (diagonals included) from a tile to the nearest tile of a building's footprint. */
function distanceToFootprint(tile: Tile, building: Building): number {
  const nearest = {
    x: Math.min(Math.max(tile.x, building.x), building.x + building.width - 1),
    y: Math.min(Math.max(tile.y, building.y), building.y + building.height - 1),
  };
  return tileDistance(tile, nearest);
}

/** Whether a tile touches a building's footprint (sides or corners) without being inside it. */
export function isBeside(tile: Tile, building: Building): boolean {
  return distanceToFootprint(tile, building) === 1;
}

/**
 * Which way to face from `tile` so the tile in front is part of the building:
 * a straight direction when one works (standing along a side), otherwise the
 * diagonal (standing at a corner). Null when not beside the building, including
 * when standing on it.
 */
export function facingToward(tile: Tile, building: Building): Direction | null {
  if (!isBeside(tile, building)) return null;
  return FACING_PREFERENCE.find((d) => covers(building, tileInFront(tile, d))) ?? null;
}

/**
 * The direction to turn before using a building, or null when no turn is
 * needed (the tile in front is already part of it) or none would help (not
 * beside it). `facing` is what the server last confirmed; null (unknown)
 * always asks for a turn.
 */
export function turnTowardBuilding(
  position: Tile,
  building: Building,
  facing: Direction | null,
): Direction | null {
  const toward = facingToward(position, building);
  if (toward === null) return null;
  if (facing !== null && covers(building, tileInFront(position, facing))) return null;
  return toward;
}

/**
 * Where to stand to use a building: `from` itself when already beside it,
 * otherwise the closest tile around the footprint (on the map, not a node or
 * another building). Never a tile inside the footprint. Ties prefer the sides
 * over the corners, then the straighter approach. Null when no tile is free.
 */
export function approachTile(from: Tile, building: Building, region: RegionSize): Tile | null {
  if (isBeside(from, building)) return from;
  let best: { tile: Tile; steps: number; corner: boolean; straightLine: number } | null = null;
  for (let y = building.y - 1; y <= building.y + building.height; y++) {
    for (let x = building.x - 1; x <= building.x + building.width; x++) {
      const tile = { x, y };
      if (!isBeside(tile, building)) continue;
      const onMap = x >= 0 && y >= 0 && x < region.width && y < region.height;
      if (!onMap || nodeAt(tile, building.region) || buildingAt(tile, building.region)) continue;
      const steps = tileDistance(from, tile);
      const corner = facingToward(tile, building)?.length === 2;
      const straightLine = (x - from.x) ** 2 + (y - from.y) ** 2;
      const better =
        !best ||
        steps < best.steps ||
        (steps === best.steps &&
          (corner !== best.corner ? !corner : straightLine < best.straightLine));
      if (better) best = { tile, steps, corner, straightLine };
    }
  }
  return best?.tile ?? null;
}

/**
 * Whether to use the building now: standing still beside it, and the server
 * has acknowledged where we stand (nothing in flight, the last position sent is
 * the current one).
 */
export function readyAtBuilding(options: {
  position: Tile;
  lastSent: Tile;
  inFlight: boolean;
  stepping: boolean;
  building: Building;
}): boolean {
  const { position, lastSent } = options;
  return (
    !options.inFlight &&
    !options.stepping &&
    position.x === lastSent.x &&
    position.y === lastSent.y &&
    isBeside(position, options.building)
  );
}
