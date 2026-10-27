import { describe, expect, it } from "vitest";
import { MOVE_SLACK_TILES, WALK_SPEED_TILES_PER_SECOND } from "../data/movement.ts";
import { REGIONS } from "../data/world.ts";
import type { CharacterState } from "../game/state.ts";
import { maxWalkTiles, moveTo, tileDistance } from "./move.ts";

const heartland = REGIONS.heartland;
const LAST_MOVE = 1_000_000;
/** Long enough after the last move to walk anywhere in the region. */
const LATER = LAST_MOVE + 60_000;

function character(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: "c1",
    name: "Alice",
    rank: "peasant",
    gold: 0,
    region: "heartland",
    x: 5,
    y: 5,
    movedAt: LAST_MOVE,
    facing: "s",
    ...overrides,
  };
}

describe("tileDistance", () => {
  it("counts diagonal steps as one tile", () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3);
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(3);
    expect(tileDistance({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe(0);
  });
});

describe("maxWalkTiles", () => {
  it("allows walking speed times elapsed time, plus slack", () => {
    expect(maxWalkTiles(0)).toBe(MOVE_SLACK_TILES);
    expect(maxWalkTiles(1_000)).toBe(WALK_SPEED_TILES_PER_SECOND + MOVE_SLACK_TILES);
  });

  it("never goes below the slack, even with clock skew", () => {
    expect(maxWalkTiles(-5_000)).toBe(MOVE_SLACK_TILES);
  });
});

describe("moveTo", () => {
  it("refuses to walk into water, and allows the shore", () => {
    const onCoast = character({ region: "east_coast", x: 17, y: 5 });
    expect(moveTo(onCoast, { x: 19, y: 5 }, LATER)).toEqual({ ok: false, reason: "water" });
    expect(moveTo(onCoast, { x: 18, y: 5 }, LATER).ok).toBe(true);
  });

  it("moves to any tile inside the region, corners included, and records the time", () => {
    expect(moveTo(character(), { x: 0, y: 0 }, LATER)).toEqual({
      ok: true,
      value: character({ x: 0, y: 0, movedAt: LATER, facing: "nw" }),
    });
    const corner = { x: heartland.width - 1, y: heartland.height - 1 };
    expect(moveTo(character(), corner, LATER)).toEqual({
      ok: true,
      value: character({ ...corner, movedAt: LATER, facing: "se" }),
    });
  });

  it("faces the way it stepped, in all 8 directions", () => {
    const start = character({ x: 5, y: 5 });
    const steps = {
      n: { x: 5, y: 4 },
      ne: { x: 6, y: 4 },
      e: { x: 6, y: 5 },
      se: { x: 6, y: 6 },
      s: { x: 5, y: 6 },
      sw: { x: 4, y: 6 },
      w: { x: 4, y: 5 },
      nw: { x: 4, y: 4 },
    } as const;
    for (const [facing, target] of Object.entries(steps)) {
      const result = moveTo(start, target, LATER);
      expect(result.ok && result.value.facing).toBe(facing);
    }
  });

  it("keeps its facing when the 'move' is to the same tile", () => {
    const result = moveTo(character({ facing: "e" }), { x: 5, y: 5 }, LATER);
    expect(result.ok && result.value.facing).toBe("e");
  });

  it("refuses tiles past the region's edge", () => {
    for (const target of [
      { x: heartland.width, y: 0 },
      { x: 0, y: heartland.height },
    ]) {
      expect(moveTo(character(), target, LATER)).toEqual({ ok: false, reason: "out_of_bounds" });
    }
  });

  it("allows walking at full speed", () => {
    const oneSecondLater = LAST_MOVE + 1_000;
    const reachable = WALK_SPEED_TILES_PER_SECOND + MOVE_SLACK_TILES;
    expect(moveTo(character({ x: 0 }), { x: reachable, y: 5 }, oneSecondLater).ok).toBe(true);
  });

  it("refuses moves faster than walking speed", () => {
    const oneSecondLater = LAST_MOVE + 1_000;
    const tooFar = WALK_SPEED_TILES_PER_SECOND + MOVE_SLACK_TILES + 1;
    expect(moveTo(character({ x: 0 }), { x: tooFar, y: 5 }, oneSecondLater)).toEqual({
      ok: false,
      reason: "moved_too_fast",
    });
  });

  it("refuses teleporting across the map right after a move", () => {
    expect(moveTo(character({ x: 0, y: 0 }), { x: 20, y: 15 }, LAST_MOVE)).toEqual({
      ok: false,
      reason: "moved_too_fast",
    });
  });

  it("leaves everything but the position and move time alone", () => {
    const before = character({ gold: 42, rank: "knight" });
    const result = moveTo(before, { x: 1, y: 2 }, LATER);
    expect(result.ok && result.value).toEqual({
      ...before,
      x: 1,
      y: 2,
      movedAt: LATER,
      facing: "nw",
    });
  });

  it("treats an unknown region as a bug, not a player mistake", () => {
    expect(() => moveTo(character({ region: "atlantis" }), { x: 0, y: 0 }, LATER)).toThrow(
      /unknown region/,
    );
  });
});
