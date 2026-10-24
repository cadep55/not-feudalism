import { describe, expect, it } from "vitest";
import {
  DIRECTION_VECTORS,
  DIRECTIONS,
  directionBetween,
  isDirection,
  tileInFront,
} from "./direction.ts";

describe("directions", () => {
  it("has 8 distinct one-tile steps", () => {
    const steps = DIRECTIONS.map((d) => `${DIRECTION_VECTORS[d].x},${DIRECTION_VECTORS[d].y}`);
    expect(new Set(steps).size).toBe(8);
    expect(steps).not.toContain("0,0");
  });

  it("finds the direction between tiles at any distance, or null for the same tile", () => {
    expect(directionBetween({ x: 5, y: 5 }, { x: 5, y: 1 })).toBe("n");
    expect(directionBetween({ x: 5, y: 5 }, { x: 9, y: 9 })).toBe("se");
    expect(directionBetween({ x: 5, y: 5 }, { x: 1, y: 6 })).toBe("sw");
    expect(directionBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });

  it("round-trips: the tile in front lies in that direction", () => {
    for (const facing of DIRECTIONS) {
      const origin = { x: 10, y: 10 };
      expect(directionBetween(origin, tileInFront(origin, facing))).toBe(facing);
    }
  });

  it("recognises direction names", () => {
    expect(isDirection("ne")).toBe(true);
    expect(isDirection("up")).toBe(false);
  });
});
