import { describe, expect, it } from "vitest";
import { STARTING_BUILDINGS } from "../data/buildings.ts";
import { TRAVEL_DURATION_MS, travelZonesIn } from "../data/world.ts";
import type { Direction } from "../game/direction.ts";
import type { GameState } from "../game/state.ts";
import { applyAction, settleWorld } from "./actions.ts";
import { placementBlocked } from "./build.ts";
import { arrivalTile, startTravel, travelZoneAt } from "./travel.ts";

const NOW = 1_000_000;
/** On heartland's north travel zone (x 11 to 13 on the top row). */
const NORTH_ZONE = { x: 12, y: 0 };

function state(x: number, y: number, facing: Direction = "n"): GameState {
  return {
    character: {
      id: "c1",
      name: "Alice",
      rank: "peasant",
      gold: 0,
      region: "heartland",
      homeRegion: "heartland",
      x,
      y,
      movedAt: 0,
      facing,
    },
    inventory: {},
    buildings: [...STARTING_BUILDINGS],
    storage: {},
    fields: [],
    villagers: [],
    job: null,
    others: [],
  };
}

describe("travel zones", () => {
  it("finds the zone a tile is on", () => {
    expect(travelZoneAt("heartland", NORTH_ZONE)?.to).toBe("north");
    expect(travelZoneAt("heartland", { x: 24, y: 8 })?.to).toBe("east_coast");
    expect(travelZoneAt("heartland", { x: 10, y: 0 })).toBeNull();
    expect(travelZoneAt("heartland", { x: 12, y: 1 })).toBeNull();
  });

  it("arrives one tile inside the next section, across from where you left", () => {
    const zone = (side: string) => {
      const found = travelZonesIn("heartland").find((z) => z.side === side);
      if (!found) throw new Error(side);
      return found;
    };
    expect(arrivalTile(zone("n"), { x: 12, y: 0 })).toEqual({ x: 12, y: 16 });
    expect(arrivalTile(zone("s"), { x: 13, y: 17 })).toEqual({ x: 13, y: 1 });
    expect(arrivalTile(zone("e"), { x: 24, y: 9 })).toEqual({ x: 1, y: 9 });
    expect(arrivalTile(zone("w"), { x: 0, y: 7 })).toEqual({ x: 23, y: 7 });
    // The arrival tile isn't on the other section's travel zone.
    expect(travelZoneAt("north", { x: 12, y: 16 })).toBeNull();
  });
});

describe("travelling", () => {
  it("takes 5 seconds on a zone, then the character is in the next section", () => {
    const started = startTravel(state(NORTH_ZONE.x, NORTH_ZONE.y), NOW);
    if (!started.ok) throw new Error(started.reason);
    expect(started.value.job).toEqual({
      kind: "travel",
      to: "north",
      arrive: { x: 12, y: 16 },
      startedAt: NOW,
      completesAt: NOW + TRAVEL_DURATION_MS,
    });
    expect(settleWorld(started.value, NOW + TRAVEL_DURATION_MS - 1).character.region).toBe(
      "heartland",
    );
    const arrived = settleWorld(started.value, NOW + TRAVEL_DURATION_MS);
    expect(arrived.job).toBeNull();
    expect(arrived.character).toMatchObject({
      region: "north",
      homeRegion: "heartland",
      x: 12,
      y: 16,
      movedAt: NOW + TRAVEL_DURATION_MS,
    });
  });

  it("refuses off a zone or while busy", () => {
    expect(startTravel(state(10, 10), NOW)).toEqual({ ok: false, reason: "not_at_travel_zone" });
    const busy = {
      ...state(NORTH_ZONE.x, NORTH_ZONE.y),
      job: {
        kind: "craft" as const,
        recipeId: "rake" as const,
        startedAt: 0,
        completesAt: NOW + 1,
      },
    };
    expect(startTravel(busy, NOW)).toEqual({ ok: false, reason: "busy" });
  });

  it("stepping off the zone cancels the trip; turning doesn't", () => {
    const started = applyAction(
      state(NORTH_ZONE.x, NORTH_ZONE.y),
      { type: "travel.start", payload: {} },
      NOW,
    );
    if (!started.ok) throw new Error(started.reason);
    const turned = applyAction(
      started.value,
      { type: "turn", payload: { facing: "e" } },
      NOW + 1_000,
    );
    expect(turned.ok && turned.value.job?.kind).toBe("travel");
    const walked = applyAction(
      started.value,
      { type: "move.to", payload: { x: 12, y: 1 } },
      NOW + 1_000,
    );
    expect(walked.ok && walked.value.job).toBeNull();
  });

  it("keeps buildings off travel zones", () => {
    // A house at (11, 1) would have the north zone in its ring.
    expect(placementBlocked(state(10, 10), "house", 11, 1)).toBe("cannot_build_here");
  });
});
