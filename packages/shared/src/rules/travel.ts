import {
  inRect,
  isRegionId,
  REGIONS,
  type RegionId,
  TRAVEL_DURATION_MS,
  type TravelZone,
  travelZonesIn,
} from "../data/world.ts";
import type { GameState } from "../game/state.ts";
import { fail, ok, type RuleResult } from "../result.ts";

// Rules: docs/design/world.md (travel between sections).

type Tile = { x: number; y: number };

/** The travel zone the tile is part of, or null. */
export function travelZoneAt(region: string, tile: Tile): TravelZone | null {
  return travelZonesIn(region).find((zone) => inRect(zone.tiles, tile)) ?? null;
}

/**
 * Where a traveller arrives: the matching spot on the next section's edge, one
 * tile in, so they don't land on its travel zone and head straight back.
 */
export function arrivalTile(zone: TravelZone, from: Tile): Tile {
  const { width, height } = REGIONS[zone.to];
  switch (zone.side) {
    case "e":
      return { x: 1, y: from.y };
    case "w":
      return { x: width - 2, y: from.y };
    case "s":
      return { x: from.x, y: 1 };
    case "n":
      return { x: from.x, y: height - 2 };
  }
}

/**
 * Starts travelling to the next section: the character must stand on a
 * travel zone with nothing else going on. After 5 seconds they arrive (see
 * completeTravel); stepping off the zone first cancels it. Free.
 */
export function startTravel(
  state: GameState,
  now: number,
): RuleResult<GameState, "busy" | "not_at_travel_zone"> {
  if (state.job) return fail("busy");
  const { character } = state;
  const zone = travelZoneAt(character.region, character);
  if (!zone) return fail("not_at_travel_zone");
  return ok({
    ...state,
    job: {
      kind: "travel",
      to: zone.to,
      arrive: arrivalTile(zone, character),
      startedAt: now,
      completesAt: now + TRAVEL_DURATION_MS,
    },
  });
}

/** The character arrives in the next section, as if they had just stepped there. */
export function completeTravel(
  state: GameState,
  to: RegionId,
  arrive: Tile,
  at: number,
): GameState {
  if (!isRegionId(to)) return state;
  return {
    ...state,
    character: { ...state.character, region: to, x: arrive.x, y: arrive.y, movedAt: at },
  };
}
