import { describe, expect, it } from "vitest";
import { REGIONS } from "../data/world.ts";
import type { CharacterState } from "../game/state.ts";
import { moveTo } from "./move.ts";

const heartland = REGIONS.heartland;

function character(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: "c1",
    name: "Alice",
    rank: "peasant",
    gold: 0,
    region: "heartland",
    x: 5,
    y: 5,
    ...overrides,
  };
}

describe("moveTo", () => {
  it("moves to any tile inside the region, corners included", () => {
    expect(moveTo(character(), { x: 0, y: 0 })).toEqual({
      ok: true,
      value: character({ x: 0, y: 0 }),
    });
    const corner = { x: heartland.width - 1, y: heartland.height - 1 };
    expect(moveTo(character(), corner)).toEqual({ ok: true, value: character(corner) });
  });

  it("refuses tiles past the region's edge", () => {
    expect(moveTo(character(), { x: heartland.width, y: 0 })).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });
    expect(moveTo(character(), { x: 0, y: heartland.height })).toEqual({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  it("leaves everything but the position alone", () => {
    const before = character({ gold: 42, rank: "knight" });
    const result = moveTo(before, { x: 1, y: 2 });
    expect(result.ok && result.value).toEqual({ ...before, x: 1, y: 2 });
  });

  it("treats an unknown region as a bug, not a player mistake", () => {
    expect(() => moveTo(character({ region: "atlantis" }), { x: 0, y: 0 })).toThrow(
      /unknown region/,
    );
  });
});
